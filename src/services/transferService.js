import { withTransaction, pool } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { isValidIban } from '../lib/iban.js';
import { percentOf } from '../lib/money.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as settingsModel from '../models/settingsModel.js';
import * as transferModel from '../models/transferModel.js';
import { ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import * as ledgerService from './ledgerService.js';
import * as otpService from './otpService.js';
import * as ratesService from './ratesService.js';
import * as fraudService from './fraudService.js';
import { notify, notifyAccountOwner, money } from './notificationService.js';

/*
 * Конвейер перевода:
 * проверка данных -> принадлежность счетов -> лимит -> комиссия -> код подтверждения -> блокировка строк и проводки -> аудит.
 * Перевод между своими счетами проходит без кода и комиссии, в том числе с конвертацией.
 */

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client) throw new AppError('Клиент не найден', 404);
  if (client.kyc_status !== 'verified') throw new BusinessError('Операции доступны после проверки анкеты сотрудником банка');
  return client;
}

/**
 * Создаёт заявку на перевод. Если нужен код подтверждения, возвращает заявку и код; иначе сразу проводит.
 * @param {number} userId
 * @param {{kind:'own'|'client', fromAccountId:number, toAccountId?:number, toIban?:string, amount:number, comment?:string}} input
 * @returns {Promise<{intent:any, otpCode?:string, executed:boolean, review?:boolean}>}
 */
export async function createTransfer(userId, input) {
  const client = await verifiedClient(userId);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new ValidationError({ amount: 'Введите сумму больше нуля' });

  const from = await accountModel.findById(input.fromAccountId);
  if (!from || from.owner_client_id !== client.id || from.status !== 'open' || !['current', 'savings'].includes(from.kind)) {
    throw new ValidationError({ fromAccountId: 'Выберите счёт списания' });
  }

  let to;
  if (input.kind === 'own') {
    to = await accountModel.findById(input.toAccountId);
    if (!to || to.owner_client_id !== client.id || to.status === 'closed' || !['current', 'savings'].includes(to.kind)) throw new ValidationError({ toAccountId: 'Выберите счёт зачисления' });
  } else {
    const iban = String(input.toIban ?? '').replace(/\s/g, '').toUpperCase();
    if (!isValidIban(iban)) throw new ValidationError({ toIban: 'Неверный номер счёта: проверьте символы и контрольные цифры' });
    to = await accountModel.findByIban(iban);
    if (!to || !['current', 'savings'].includes(to.kind) || to.status === 'closed') throw new ValidationError({ toIban: 'Счёт получателя не найден в ТалерБанке' });
  }
  if (to.id === from.id) throw new ValidationError({ toAccountId: 'Счета списания и зачисления совпадают' });

  const amountByn = await ratesService.toBynOfficial(from.currency, input.amount);
  const feePercent = input.kind === 'client' ? await settingsModel.getNumber('transfer.fee_percent') : 0;
  const fee = percentOf(input.amount, feePercent);

  if (input.kind === 'client') {
    const limit = await settingsModel.getNumber('transfer.daily_limit');
    const sent = await transferModel.sentTodayByn(userId);
    if (sent + amountByn > limit) throw new BusinessError('Превышен суточный лимит переводов', 'daily_limit');
  }

  const risk = input.kind === 'client'
    ? await fraudService.evaluate({ userId, clientId: client.id, toAccountId: to.id, amountByn })
    : { score: 0, reasons: [], decision: 'allow', special: false };

  const intent = await transferModel.insertIntent(pool, {
    userId, kind: input.kind, fromAccountId: from.id, toAccountId: to.id, amount: input.amount, amountByn, fee,
    comment: String(input.comment ?? '').trim().slice(0, 140)
  });

  // подозрительный перевод задерживается: деньги резервируются, решение принимает специалист по мониторингу
  if (risk.decision === 'review') {
    await withTransaction(async (db) => {
      await transferModel.setStatus(intent.id, 'review', db);
      await db.query('INSERT INTO holds (account_id, amount, intent_id) VALUES (?, ?, ?)', [from.id, input.amount + fee, intent.id]);
      await fraudService.recordCase(db, intent, risk);
      await auditService.log({ userId, action: 'transfer.held', entity: 'transfer', entityId: intent.id, details: { score: risk.score } }, db);
      await notify(userId, { type: 'transfer', title: 'Перевод на проверке', body: `Перевод ${money(input.amount, from.currency)} задержан для проверки. Деньги на счёте зарезервированы.`, link: `/accounts/${from.id}` }, db);
    });
    return { intent: { ...intent, status: 'review' }, executed: false, review: true };
  }
  if (risk.decision === 'confirm' || risk.special) await fraudService.recordCase(pool, intent, risk);

  const otpThreshold = await settingsModel.getNumber('transfer.otp_threshold');
  if (input.kind === 'client' && (amountByn >= otpThreshold || risk.decision === 'confirm')) {
    const otpCode = await otpService.issue(userId, `transfer:${intent.id}`);
    await auditService.log({ userId, action: 'transfer.otp_sent', entity: 'transfer', entityId: intent.id });
    return { intent, otpCode, executed: false };
  }
  await executeIntent(userId, intent.id);
  return { intent, executed: true };
}

/** Подтверждение перевода кодом. */
export async function confirmTransfer(userId, intentId, code) {
  const intent = await transferModel.findIntent(intentId, userId);
  if (!intent) throw new AppError('Перевод не найден', 404);
  if (intent.status !== 'new') throw new BusinessError('Перевод уже обработан');
  if (new Date(intent.expires_at) < new Date()) {
    await transferModel.setStatus(intent.id, 'expired');
    throw new BusinessError('Время подтверждения истекло. Создайте перевод заново');
  }
  // код проверяется вне денежной транзакции, чтобы счётчик неверных попыток сохранялся
  await otpService.verify(userId, `transfer:${intent.id}`, code);
  return executeIntent(userId, intent.id);
}

export async function cancelTransfer(userId, intentId) {
  const intent = await transferModel.findIntent(intentId, userId);
  if (intent && intent.status === 'new') await transferModel.setStatus(intent.id, 'cancelled');
}

/**
 * Проводит перевод. Повторный вызов для той же заявки ничего не делает (идемпотентность).
 */
export async function executeIntent(userId, intentId) {
  return withTransaction(async (db) => {
    const intent = await transferModel.lockIntent(db, intentId, userId);
    if (!intent) throw new AppError('Перевод не найден', 404);
    if (intent.status === 'confirmed') return { documentId: intent.document_id, duplicate: true, intent };
    if (intent.status !== 'new') throw new BusinessError('Перевод уже обработан');

    const from = await accountModel.findById(intent.from_account_id, db);
    const to = await accountModel.findById(intent.to_account_id, db);
    const entries = [];
    let received = intent.amount;
    if (from.currency === to.currency) {
      entries.push({ debit: from.id, credit: to.id, amount: intent.amount, currency: from.currency });
    } else {
      // конвертация идёт через счета конвертации банка в каждой валюте
      const target = await ratesService.convert({ from: from.currency, to: to.currency, amount: intent.amount }, db);
      if (target <= 0) throw new BusinessError('Сумма слишком мала для конвертации');
      const convFrom = await ensureInternalAccount(db, 'conversion', from.currency);
      const convTo = await ensureInternalAccount(db, 'conversion', to.currency);
      received = target;
      entries.push({ debit: from.id, credit: convFrom.id, amount: intent.amount, currency: from.currency });
      entries.push({ debit: convTo.id, credit: to.id, amount: target, currency: to.currency });
    }
    if (intent.fee > 0) {
      const income = await ensureInternalAccount(db, 'income', from.currency);
      entries.push({ debit: from.id, credit: income.id, amount: intent.fee, currency: from.currency });
    }

    const description = intent.comment || (intent.kind === 'own' ? 'Перевод между своими счетами' : 'Перевод клиенту банка');
    const { documentId } = await ledgerService.post({
      type: intent.kind === 'own' ? 'transfer_own' : 'transfer_client',
      description, initiatedBy: userId, idempotencyKey: `transfer:${intent.id}`, entries
    }, db);
    await transferModel.markConfirmed(db, intent.id, documentId);
    await notify(userId, { type: 'transfer', title: 'Перевод выполнен', body: `Списано ${money(intent.amount + intent.fee, from.currency)}. ${description}`, link: `/accounts/${from.id}` }, db);
    if (intent.kind === 'client') await notifyAccountOwner(to.id, { type: 'transfer', title: 'Поступил перевод', body: `${money(received, to.currency)}. ${description}`, link: `/accounts/${to.id}` }, db);
    await auditService.log({ userId, action: 'transfer.done', entity: 'transfer', entityId: intent.id, details: { kind: intent.kind, amount: intent.amount, currency: from.currency } }, db);
    return { documentId, duplicate: false, intent };
  });
}

/** Решение специалиста по мониторингу по задержанному переводу. */
export function reviewHeldTransfer(officerId, caseId, decision) {
  return fraudService.review(officerId, caseId, decision, executeIntent);
}
