import { query, pool } from '../db/pool.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { addDays } from '../lib/dates.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';

/**
 * Выписка по счёту за период (даты включительно): входящий остаток, операции с накопительным остатком, итоги.
 * Входящий остаток считается по проводкам до начала периода, поэтому выписка не зависит от кэша остатка.
 * @param {number} userId
 * @param {number} accountId
 * @param {{from?:string, to?:string}} [period] по умолчанию последние 30 дней
 */
export async function getStatement(userId, accountId, period = {}) {
  const client = await clientModel.findByUserId(userId);
  const account = client ? await accountModel.findById(accountId) : null;
  if (!account || account.owner_client_id !== client.id) throw new AppError('Счёт не найден', 404);

  const { rows: [state] } = await query('SELECT bank_date FROM bank_state');
  const today = String(state.bank_date).slice(0, 10);
  const to = period.to || today;
  const from = period.from || addDays(to, -30);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) throw new ValidationError({ from: 'Укажите период в формате ГГГГ-ММ-ДД' });
  if (from > to) throw new ValidationError({ from: 'Дата начала позже даты окончания' });

  const { rows: [open] } = await query(
    `SELECT COALESCE(SUM(CASE WHEN credit_account_id = $1 THEN amount ELSE -amount END), 0) AS balance
     FROM postings WHERE (credit_account_id = $1 OR debit_account_id = $1) AND bank_date < $2`, [accountId, from]);
  const { rows } = await query(
    `SELECT p.id, p.bank_date, d.type, d.description, CASE WHEN p.credit_account_id = $1 THEN p.amount ELSE -p.amount END AS signed
     FROM postings p JOIN documents d ON d.id = p.document_id
     WHERE (p.credit_account_id = $1 OR p.debit_account_id = $1) AND p.bank_date >= $2 AND p.bank_date <= $3 ORDER BY p.id`,
    [accountId, from, to]);

  let running = Number(open.balance);
  const operations = rows.map((r) => {
    running += r.signed;
    return { date: String(r.bank_date).slice(0, 10), description: r.description || r.type, amount: r.signed, balance: running };
  });
  const credit = operations.filter((o) => o.amount > 0).reduce((t, o) => t + o.amount, 0);
  const debit = operations.filter((o) => o.amount < 0).reduce((t, o) => t + o.amount, 0);
  return { account, client, from, to, today, opening: Number(open.balance), closing: running, credit, debit, operations };
}

/** Справка об остатке на счёте на текущую банковскую дату. */
export async function getCertificate(userId, accountId) {
  const s = await getStatement(userId, accountId);
  const { rows: [h] } = await pool.query("SELECT COALESCE(SUM(amount), 0) AS held FROM holds WHERE account_id = $1 AND status = 'active'", [accountId]);
  return { account: s.account, client: s.client, date: s.today, balance: s.closing, held: Number(h.held) };
}
