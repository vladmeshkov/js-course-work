import { query } from '../db/pool.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as ratesService from './ratesService.js';
import * as settingsService from './settingsService.js';

/**
 * Данные главной страницы клиента: остатки, последние операции, сводки по продуктам, курсы.
 * Всё считается по базе в момент открытия страницы.
 */
export async function forClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client) return { client: null };
  const accounts = (await accountModel.listByClient(client.id)).filter((a) => a.kind !== 'loan');

  // «Всего на счетах»: текущие и накопительные, валюты по официальному курсу в BYN
  let totalByn = 0;
  for (const a of accounts.filter((x) => ['current', 'savings'].includes(x.kind))) {
    totalByn += await ratesService.toBynOfficial(a.currency, a.balance);
  }

  const ids = accounts.length ? accounts.map((a) => a.id) : [0];
  const { rows: operations } = await query(
    `SELECT p.id, p.currency, p.bank_date, d.type, d.description,
            CASE WHEN p.credit_account_id IN (?) THEN p.amount ELSE -p.amount END AS signed
     FROM postings p JOIN documents d ON d.id = p.document_id
     WHERE (p.credit_account_id IN (?) OR p.debit_account_id IN (?))
       AND d.type NOT IN ('deposit_open', 'deposit_return', 'loan_issue')
     ORDER BY p.id DESC LIMIT 6`,
    [ids, ids, ids]);

  const { rows: [cards] } = await query("SELECT count(*) AS n FROM cards WHERE client_id = ? AND status <> 'closed'", [client.id]);
  const { rows: [deposits] } = await query(
    `SELECT count(*) AS n, COALESCE(sum(a.balance), 0) AS total
     FROM deposits d JOIN accounts a ON a.id = d.account_id WHERE d.client_id = ? AND d.status = 'active'`, [client.id]);
  const { rows: [loans] } = await query(
    `SELECT count(*) AS n, COALESCE(sum(principal_balance), 0) AS debt FROM loans WHERE client_id = ? AND status = 'active'`, [client.id]);
  const { rows: [nextPayment] } = await query(
    `SELECT s.due_date, s.principal + s.interest + s.penalty AS total, s.status
     FROM loan_schedule s JOIN loans l ON l.id = s.loan_id
     WHERE l.client_id = ? AND l.status = 'active' AND s.status IN ('planned', 'overdue') ORDER BY s.due_date LIMIT 1`, [client.id]);
  const { rows: [maxDeposit] } = await query('SELECT max(rate_percent) AS rate FROM deposit_products WHERE active');
  const { rows: [minLoan] } = await query('SELECT min(rate_percent) AS rate FROM loan_products WHERE active');

  return {
    client, accounts, totalByn, operations,
    cards: cards.n,
    deposits: { count: deposits.n, total: Number(deposits.total) },
    loans: { count: loans.n, debt: Number(loans.debt) },
    nextPayment: nextPayment ? { dueDate: String(nextPayment.due_date).slice(0, 10), total: Number(nextPayment.total), overdue: nextPayment.status === 'overdue' } : null,
    maxDepositRate: Number(maxDeposit.rate),
    minLoanRate: Number(minLoan.rate),
    rates: (await settingsService.spreads()).filter((r) => r.rate !== null).sort((a, b) => ['USD', 'EUR', 'RUB', 'CNY'].indexOf(a.currency) - ['USD', 'EUR', 'RUB', 'CNY'].indexOf(b.currency))
  };
}
