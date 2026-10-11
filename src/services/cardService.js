import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { withTransaction } from '../db/pool.js';
import { encrypt, lookupHash, randomCode } from '../lib/crypto.js';
import { addMonths, addDays } from '../lib/dates.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { luhnCheckDigit } from '../lib/luhn.js';
import * as accountModel from '../models/accountModel.js';
import * as cardModel from '../models/cardModel.js';
import * as clientModel from '../models/clientModel.js';
import { ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import * as ledgerService from './ledgerService.js';

/*
 * Виртуальные карты. Номер генерируется с контрольной цифрой по алгоритму Луна и хранится зашифрованным,
 * CVV и PIN хранятся только как хэш. Полный номер и CVV показываются один раз, при выпуске.
 * Покупка по карте проверяет статус, лимиты (на операцию, на сутки, на месяц) и разрешение интернет-платежей.
 */

export const SYSTEMS = { belkart: 'Белкарт', visa: 'Visa', mastercard: 'Mastercard' };
const BIN = { belkart: '911200', visa: '411111', mastercard: '520000' };
const MAX_ACTIVE_CARDS = 5;

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError('Карты доступны после проверки анкеты сотрудником банка');
  return client;
}

async function bankDate(db) {
  const { rows } = await db.query('SELECT bank_date FROM bank_state');
  return String(rows[0].bank_date).slice(0, 10);
}

/** Строит номер карты: BIN, 9 случайных цифр и контрольная цифра Луна. */
export function generateCardNumber(system) {
  const body = BIN[system] + String(crypto.randomInt(0, 1e9)).padStart(9, '0');
  return body + luhnCheckDigit(body);
}

/**
 * Выпуск карты. Возвращает открытые данные карты, которые больше не будут показаны.
 * @param {number} userId
 * @param {{accountId:number, system:string, pin:string}} input
 */
export async function issueCard(userId, { accountId, system, pin }) {
  const client = await verifiedClient(userId);
  const errors = {};
  if (!SYSTEMS[system]) errors.system = 'Выберите платёжную систему';
  if (!/^\d{4}$/.test(String(pin ?? ''))) errors.pin = 'PIN-код: ровно четыре цифры';
  const account = await accountModel.findById(accountId);
  if (!account || account.owner_client_id !== client.id || account.status !== 'open' || !['current', 'savings'].includes(account.kind)) {
    errors.accountId = 'Выберите счёт для карты';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if ((await cardModel.listByClient(client.id)).length >= MAX_ACTIVE_CARDS) throw new BusinessError(`Нельзя иметь больше ${MAX_ACTIVE_CARDS} карт`);

  let number;
  do {
    number = generateCardNumber(system);
  } while (await cardModel.numberExists(lookupHash(number)));
  const cvv = randomCode(3);
  const [pinHash, cvvHash] = await Promise.all([bcrypt.hash(pin, 10), bcrypt.hash(cvv, 10)]);

  return withTransaction(async (db) => {
    const today = await bankDate(db);
    const expires = addMonths(today, 36).slice(5, 7) + '/' + addMonths(today, 36).slice(2, 4);
    const id = await cardModel.insert(db, {
      clientId: client.id, accountId: account.id, system, numberEnc: encrypt(number), numberHash: lookupHash(number), last4: number.slice(-4),
      holder: `${client.first_name} ${client.last_name}`.toUpperCase().replace(/[^A-ZА-Я ]/g, ''), expires, cvvHash, pinHash
    });
    await auditService.log({ userId, action: 'card.issue', entity: 'card', entityId: id, details: { system } }, db);
    return { id, number, cvv, expires };
  });
}

export async function listForClient(userId) {
  const client = await clientModel.findByUserId(userId);
  return client ? cardModel.listByClient(client.id) : [];
}

export async function getForClient(userId, cardId) {
  const client = await clientModel.findByUserId(userId);
  const card = client ? await cardModel.findForClient(cardId, client.id) : null;
  if (!card) throw new AppError('Карта не найдена', 404);
  return { card, operations: await cardModel.recentOperations(card.id) };
}

async function lockOwned(db, userId, cardId) {
  const client = await clientModel.findByUserId(userId);
  const card = client ? await cardModel.lock(db, cardId) : null;
  if (!card || card.client_id !== client.id) throw new AppError('Карта не найдена', 404);
  return card;
}

/** Блокировка и разблокировка. Закрытую карту вернуть нельзя. */
export function setBlocked(userId, cardId, blocked) {
  return withTransaction(async (db) => {
    const card = await lockOwned(db, userId, cardId);
    if (card.status === 'closed') throw new BusinessError('Карта закрыта');
    await cardModel.setStatus(db, card.id, blocked ? 'blocked' : 'active');
    await auditService.log({ userId, action: blocked ? 'card.block' : 'card.unblock', entity: 'card', entityId: card.id }, db);
  });
}

export function closeCard(userId, cardId) {
  return withTransaction(async (db) => {
    const card = await lockOwned(db, userId, cardId);
    await cardModel.setStatus(db, card.id, 'closed');
    await auditService.log({ userId, action: 'card.close', entity: 'card', entityId: card.id }, db);
  });
}

/** Перевыпуск: новая карта на тот же счёт, старая закрывается. */
export async function reissue(userId, cardId, pin) {
  const { card } = await getForClient(userId, cardId);
  const fresh = await issueCard(userId, { accountId: card.account_id, system: card.system, pin });
  await closeCard(userId, cardId);
  return fresh;
}

/**
 * Изменение лимитов. Лимит на операцию не больше суточного, суточный не больше месячного.
 * @param {{perOp:number, daily:number, monthly:number, online:boolean}} limits суммы в копейках
 */
export async function updateLimits(userId, cardId, limits) {
  const errors = {};
  for (const key of ['perOp', 'daily', 'monthly']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) errors[key] = 'Введите сумму больше нуля';
  }
  if (!errors.perOp && !errors.daily && limits.perOp > limits.daily) errors.perOp = 'Лимит на операцию не может быть больше суточного';
  if (!errors.daily && !errors.monthly && limits.daily > limits.monthly) errors.daily = 'Суточный лимит не может быть больше месячного';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return withTransaction(async (db) => {
    const card = await lockOwned(db, userId, cardId);
    if (card.status === 'closed') throw new BusinessError('Карта закрыта');
    await cardModel.setLimits(db, card.id, limits);
    await auditService.log({ userId, action: 'card.limits', entity: 'card', entityId: card.id, details: limits }, db);
  });
}

/**
 * Покупка по карте (имитация терминала или интернет-магазина). Деньги списываются со счёта карты.
 * @param {{amount:number, online:boolean, place:string}} p
 */
export function purchase(userId, cardId, { amount, online, place }) {
  return withTransaction(async (db) => {
    const card = await lockOwned(db, userId, cardId);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError({ amount: 'Введите сумму больше нуля' });
    if (card.status === 'blocked') throw new BusinessError('Карта заблокирована', 'card_blocked');
    if (card.status !== 'active') throw new BusinessError('Карта закрыта');
    if (online && !card.online_enabled) throw new BusinessError('Интернет-платежи по карте отключены', 'online_disabled');
    if (amount > card.per_op_limit) throw new BusinessError('Превышен лимит на одну операцию', 'per_op_limit');

    const today = await bankDate(db);
    const monthStart = today.slice(0, 8) + '01';
    if ((await cardModel.spent(db, card.id, today, addDays(today, 1))) + amount > card.daily_limit) throw new BusinessError('Превышен суточный лимит по карте', 'daily_limit');
    if ((await cardModel.spent(db, card.id, monthStart, addMonths(monthStart, 1))) + amount > card.monthly_limit) throw new BusinessError('Превышен месячный лимит по карте', 'monthly_limit');

    const account = await accountModel.findById(card.account_id, db);
    const merchants = await ensureInternalAccount(db, 'correspondent', account.currency);
    const { documentId } = await ledgerService.post({
      type: 'card_purchase', description: `Оплата картой *${card.last4}: ${String(place || 'магазин').slice(0, 60)}`, initiatedBy: userId,
      entries: [{ debit: account.id, credit: merchants.id, amount, currency: account.currency }]
    }, db);
    await cardModel.insertOperation(db, { cardId: card.id, documentId, amount, online: Boolean(online), place: String(place ?? '').slice(0, 60) });
    return { documentId };
  });
}
