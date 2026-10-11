import { pool, query, withTransaction } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { isValidIban } from '../lib/iban.js';
import { percentOf } from '../lib/money.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as settingsModel from '../models/settingsModel.js';
import { ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import * as ledgerService from './ledgerService.js';
import { notify, notifyAccountOwner, money } from './notificationService.js';
import * as fraudService from './fraudService.js';
import * as otpService from './otpService.js';

/*
 * Межбанковские переводы через клиринг.
 * 1. Клиент оформляет перевод и подтверждает его кодом: на счёте резервируется сумма с комиссией (холд).
 * 2. При закрытии операционного дня все платежи отправляются одним клиринговым пакетом: деньги списываются
 *    со счёта клиента на корреспондентский счёт банка. Если банк получателя не принимает платежи, перевод
 *    отклоняется, холд снимается.
 * 3. Входящий платёж из другого банка регистрирует операционист: Дт корсчёт, Кт счёт клиента.
 * В номере IBAN код банка стоит на позициях 5-8, по нему определяется банк получателя.
 */

export const bankCodeOf = (iban) => String(iban).replace(/\s/g, '').toUpperCase().slice(4, 8);

export async function banks(db = { query }) {
  return (await db.query('SELECT * FROM external_banks ORDER BY name')).rows;
}

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError('Переводы доступны после проверки анкеты сотрудником банка');
  return client;
}

/** Расчёт комиссии: процент от суммы, но не меньше минимальной. */
export async function feeFor(amount, db = pool) {
  const percent = await settingsModel.getNumber('interbank.fee_percent', db);
  const min = await settingsModel.getNumber('interbank.min_fee', db);
  return Math.max(min, percentOf(amount, percent));
}

/**
 * Оформление перевода в другой банк. Возвращает заявку и код подтверждения.
 * @param {number} userId
 * @param {{fromAccountId:number, iban:string, name:string, amount:number, purpose?:string}} input
 */
export async function createTransfer(userId, input) {
  const client = await verifiedClient(userId);
  const errors = {};
  const iban = String(input.iban ?? '').replace(/\s/g, '').toUpperCase();
  let bank = null;
  if (!isValidIban(iban)) errors.iban = 'Неверный номер счёта: проверьте символы и контрольные цифры';
  else {
    bank = (await query('SELECT * FROM external_banks WHERE code = $1', [bankCodeOf(iban)])).rows[0];
    if (!bank) errors.iban = 'Банк получателя не найден. Для переводов внутри ТалерБанка используйте перевод клиенту банка';
  }
  const name = String(input.name ?? '').trim();
  if (name.length < 3) errors.name = 'Укажите получателя полностью';
  const max = await settingsModel.getNumber('interbank.max_amount');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) errors.amount = 'Введите сумму больше нуля';
  else if (input.amount > max) errors.amount = `Не больше ${max / 100} BYN за один перевод`;
  const from = await accountModel.findById(input.fromAccountId);
  if (!from || from.owner_client_id !== client.id || from.status !== 'open' || from.currency !== 'BYN' || !['current', 'savings'].includes(from.kind)) {
    errors.fromAccountId = 'Выберите счёт в BYN';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const fee = await feeFor(input.amount);
  const held = await accountModel.heldAmount(pool, from.id);
  if (from.balance - held - from.min_balance < input.amount + fee) throw new BusinessError('Недостаточно средств с учётом комиссии', 'insufficient_funds');

  // риск оценивается сразу, решение (задержка на проверку) применяется после подтверждения кодом
  const risk = await fraudService.evaluateInterbank({ userId, clientId: client.id, counterpartyIban: iban, amountByn: input.amount });
  const { rows: [transfer] } = await query(
    `INSERT INTO interbank_transfers (user_id, account_id, direction, bank_code, counterparty_name, counterparty_iban, amount, fee, purpose, status, expires_at,
                                      risk_score, risk_reasons, risk_decision, risk_special)
     VALUES ($1, $2, 'out', $3, $4, $5, $6, $7, $8, 'pending_otp', now() + interval '10 minutes', $9, $10, $11, $12) RETURNING *`,
    [userId, from.id, bank.code, name, iban, input.amount, fee, String(input.purpose ?? '').trim().slice(0, 140),
      risk.score, JSON.stringify(risk.reasons), risk.decision, risk.special]);
  const otpCode = await otpService.issue(userId, `interbank:${transfer.id}`);
  return { transfer, otpCode, bank };
}

export async function findForUser(userId, id, db = { query }) {
  const { rows } = await db.query(
    `SELECT t.*, b.name AS bank_name, a.iban AS from_iban FROM interbank_transfers t
     JOIN external_banks b ON b.code = t.bank_code JOIN accounts a ON a.id = t.account_id WHERE t.id = $1 AND t.user_id = $2`, [id, userId]);
  return rows[0];
}

/** Подтверждение кодом: деньги резервируются, платёж встаёт в очередь клиринга. */
export async function confirm(userId, id, code) {
  const transfer = await findForUser(userId, id);
  if (!transfer) throw new AppError('Перевод не найден', 404);
  if (transfer.status !== 'pending_otp') throw new BusinessError('Перевод уже обработан');
  if (new Date(transfer.expires_at) < new Date()) throw new BusinessError('Время подтверждения истекло. Оформите перевод заново');
  await otpService.verify(userId, `interbank:${id}`, code);
  return withTransaction(async (db) => {
    const { rows: [locked] } = await db.query('SELECT * FROM interbank_transfers WHERE id = $1 FOR UPDATE', [id]);
    if (locked.status !== 'pending_otp') throw new BusinessError('Перевод уже обработан');
    const [account] = Object.values(Object.fromEntries(await accountModel.lockAll(db, [locked.account_id])));
    const held = await accountModel.heldAmount(db, account.id);
    if (account.balance - held - account.min_balance < locked.amount + locked.fee) throw new BusinessError('Недостаточно средств с учётом комиссии', 'insufficient_funds');
    const { rows: [hold] } = await db.query('INSERT INTO holds (account_id, amount) VALUES ($1, $2) RETURNING id', [account.id, locked.amount + locked.fee]);
    const risk = { score: locked.risk_score, reasons: locked.risk_reasons, decision: locked.risk_decision, special: locked.risk_special };
    if (risk.decision === 'review') {
      // подозрительный платёж: деньги зарезервированы, решение принимает специалист по мониторингу
      await db.query("UPDATE interbank_transfers SET status = 'review', hold_id = $2 WHERE id = $1", [id, hold.id]);
      await fraudService.recordInterbankCase(db, locked, risk);
      await notify(userId, { type: 'transfer', title: 'Перевод на проверке', body: `Перевод ${money(locked.amount)} получателю ${locked.counterparty_name} задержан для проверки. Деньги на счёте зарезервированы.`, link: '/transfers/interbank' }, db);
      await auditService.log({ userId, action: 'interbank.held', entity: 'interbank', entityId: id, details: { score: risk.score } }, db);
      return { ...locked, status: 'review', hold_id: hold.id };
    }
    if (risk.special) await fraudService.recordInterbankCase(db, locked, risk);
    await db.query("UPDATE interbank_transfers SET status = 'queued', hold_id = $2 WHERE id = $1", [id, hold.id]);
    await notify(userId, { type: 'transfer', title: 'Перевод в другой банк принят', body: `${money(locked.amount)} получателю ${locked.counterparty_name}. Отправится при закрытии операционного дня.`, link: '/transfers/interbank' }, db);
    await auditService.log({ userId, action: 'interbank.queued', entity: 'interbank', entityId: id, details: { amount: locked.amount } }, db);
    return { ...locked, status: 'queued', hold_id: hold.id };
  });
}

/** Отмена: пока платёж не ушёл в клиринг, его можно отозвать. */
export async function cancel(userId, id) {
  return withTransaction(async (db) => {
    const { rows: [t] } = await db.query('SELECT * FROM interbank_transfers WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
    if (!t) throw new AppError('Перевод не найден', 404);
    if (!['pending_otp', 'queued'].includes(t.status)) throw new BusinessError('Этот перевод уже нельзя отменить');
    if (t.hold_id) await db.query("UPDATE holds SET status = 'released', closed_at = now() WHERE id = $1", [t.hold_id]);
    await db.query("UPDATE interbank_transfers SET status = 'cancelled' WHERE id = $1", [id]);
    await auditService.log({ userId, action: 'interbank.cancel', entity: 'interbank', entityId: id }, db);
  });
}

/**
 * Клиринг: отправка очереди одним пакетом при закрытии операционного дня.
 * @param {import('pg').PoolClient} db
 * @param {string} date банковская дата пакета
 * @returns {Promise<{sent:number, rejected:number, total:number}>}
 */
export async function processClearing(db, date) {
  const { rows: queued } = await db.query("SELECT * FROM interbank_transfers WHERE status = 'queued' AND direction = 'out' ORDER BY id FOR UPDATE");
  if (!queued.length) return { sent: 0, rejected: 0, total: 0 };
  const { rows: [batch] } = await db.query(
    'INSERT INTO clearing_batches (bank_date) VALUES ($1) ON CONFLICT (bank_date) DO UPDATE SET bank_date = EXCLUDED.bank_date RETURNING id', [date]);
  const correspondent = await ensureInternalAccount(db, 'correspondent', 'BYN');
  const income = await ensureInternalAccount(db, 'income', 'BYN');
  const stats = { sent: 0, rejected: 0, total: 0 };
  const owner = async (accountId) => (await db.query('SELECT c.user_id FROM accounts a JOIN clients c ON c.id = a.owner_client_id WHERE a.id = $1', [accountId])).rows[0]?.user_id;

  for (const t of queued) {
    await db.query("UPDATE holds SET status = 'released', closed_at = now() WHERE id = $1", [t.hold_id]);
    const { rows: [bank] } = await db.query('SELECT active, name FROM external_banks WHERE code = $1', [t.bank_code]);
    if (!bank.active) {
      await db.query("UPDATE interbank_transfers SET status = 'rejected', reject_reason = $2, batch_id = $3 WHERE id = $1", [t.id, 'Банк получателя не принимает платежи', batch.id]);
      await notify(await owner(t.account_id), { type: 'transfer', title: 'Перевод в другой банк отклонён', body: `${bank.name} не принимает платежи. Деньги разблокированы на вашем счёте.`, link: '/transfers/interbank' }, db);
      stats.rejected += 1;
      continue;
    }
    const entries = [{ debit: t.account_id, credit: correspondent.id, amount: t.amount, currency: 'BYN' }];
    if (t.fee > 0) entries.push({ debit: t.account_id, credit: income.id, amount: t.fee, currency: 'BYN' });
    const { documentId } = await ledgerService.post({
      type: 'interbank_out', description: `Перевод в ${bank.name}: ${t.counterparty_name}${t.purpose ? '. ' + t.purpose : ''}`, initiatedBy: t.user_id, entries
    }, db);
    await db.query("UPDATE interbank_transfers SET status = 'sent', document_id = $2, batch_id = $3, sent_date = $4 WHERE id = $1", [t.id, documentId, batch.id, date]);
    await notify(await owner(t.account_id), { type: 'transfer', title: 'Перевод в другой банк отправлен', body: `${money(t.amount)} получателю ${t.counterparty_name}, ${bank.name}. Комиссия ${money(t.fee)}.`, link: '/transfers/interbank' }, db);
    stats.sent += 1;
    stats.total += t.amount;
  }
  await db.query('UPDATE clearing_batches SET transfers = $2, rejected = $3, total = $4 WHERE id = $1', [batch.id, stats.sent, stats.rejected, stats.total]);
  return stats;
}

/**
 * Входящий платёж из другого банка, его регистрирует операционист.
 * @param {number} operatorId
 * @param {{iban:string, bankCode:string, name:string, amount:number, purpose?:string}} p iban: счёт клиента ТалерБанка
 */
export async function registerIncoming(operatorId, { iban, bankCode, name, amount, purpose }) {
  const errors = {};
  const clean = String(iban ?? '').replace(/\s/g, '').toUpperCase();
  const account = isValidIban(clean) ? await accountModel.findByIban(clean) : null;
  if (!account || !['current', 'savings'].includes(account.kind) || account.currency !== 'BYN' || account.status === 'closed') errors.iban = 'Счёт клиента в BYN не найден';
  const bank = (await query('SELECT * FROM external_banks WHERE code = $1', [bankCode])).rows[0];
  if (!bank) errors.bankCode = 'Выберите банк отправителя';
  if (String(name ?? '').trim().length < 3) errors.name = 'Укажите отправителя';
  if (!Number.isSafeInteger(amount) || amount <= 0) errors.amount = 'Введите сумму больше нуля';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return withTransaction(async (db) => {
    const correspondent = await ensureInternalAccount(db, 'correspondent', 'BYN');
    const { documentId } = await ledgerService.post({
      type: 'interbank_in', description: `Поступление из ${bank.name}: ${String(name).trim()}${purpose ? '. ' + String(purpose).trim() : ''}`, initiatedBy: operatorId,
      entries: [{ debit: correspondent.id, credit: account.id, amount, currency: 'BYN' }]
    }, db);
    const { rows: [t] } = await db.query(
      `INSERT INTO interbank_transfers (user_id, account_id, direction, bank_code, counterparty_name, counterparty_iban, amount, purpose, status, document_id, sent_date)
       VALUES ($1, $2, 'in', $3, $4, $5, $6, $7, 'sent', $8, (SELECT bank_date FROM bank_state)) RETURNING id`,
      [operatorId, account.id, bank.code, String(name).trim(), `BY00${bank.code}0000000000000000000000`.slice(0, 28), amount, String(purpose ?? '').trim().slice(0, 140), documentId]);
    await notifyAccountOwner(account.id, { type: 'transfer', title: 'Поступил перевод из другого банка', body: `${money(amount)} от ${String(name).trim()}, ${bank.name}`, link: `/accounts/${account.id}` }, db);
    await auditService.log({ userId: operatorId, action: 'interbank.incoming', entity: 'interbank', entityId: t.id, details: { amount } }, db);
    return t;
  });
}

export async function listForUser(userId) {
  const { rows } = await query(
    `SELECT t.*, b.name AS bank_name FROM interbank_transfers t JOIN external_banks b ON b.code = t.bank_code
     WHERE t.user_id = $1 AND t.direction = 'out' ORDER BY t.id DESC LIMIT 30`, [userId]);
  return rows;
}

export async function clearingOverview() {
  const batches = (await query('SELECT * FROM clearing_batches ORDER BY bank_date DESC LIMIT 20')).rows;
  const queue = (await query(
    `SELECT t.id, t.amount, t.fee, t.counterparty_name, b.name AS bank_name, b.active FROM interbank_transfers t
     JOIN external_banks b ON b.code = t.bank_code WHERE t.status = 'queued' ORDER BY t.id`)).rows;
  return { batches, queue, banks: await banks() };
}
