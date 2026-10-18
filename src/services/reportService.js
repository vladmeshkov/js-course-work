import { query } from '../db/pool.js';
import { ValidationError } from '../lib/errors.js';
import { addDays } from '../lib/dates.js';

export const BALANCE_NAMES = {
  '1010': 'Касса',
  '1100': 'Корреспондентский счёт, расчёты по картам',
  '1210': 'Счета конвертации',
  '2200': 'Ссудные счета (кредиты клиентов)',
  '2400': 'Текущие счета физических лиц',
  '2420': 'Накопительные счета',
  '2600': 'Вклады физических лиц',
  '3300': 'Расчёты с поставщиками услуг',
  '6000': 'Доходы банка',
  '7000': 'Расходы банка (проценты по вкладам)'
};

async function bankDate() {
  const { rows } = await query('SELECT bank_date FROM bank_state');
  return String(rows[0].bank_date).slice(0, 10);
}

/**
 * Оборотно-сальдовая ведомость за период по балансовым счетам в одной валюте.
 * Остаток считается как обороты по Кт минус обороты по Дт, как и везде в системе.
 * Контроль: итоги оборотов по Дт и по Кт равны, сумма входящих остатков равна сумме исходящих.
 */
export async function trialBalance({ from, to, currency = 'BYN' } = {}) {
  const today = await bankDate();
  to = to || today;
  from = from || `${to.slice(0, 8)}01`;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) throw new ValidationError({ from: 'Укажите период в формате ГГГГ-ММ-ДД' });
  if (from > to) throw new ValidationError({ from: 'Дата начала позже даты окончания' });
  const { rows } = await query(
    `WITH moves AS (
       SELECT a.balance_code AS code, p.bank_date, p.amount AS debit, 0 AS credit
         FROM postings p JOIN accounts a ON a.id = p.debit_account_id WHERE p.currency = ?
       UNION ALL
       SELECT a.balance_code, p.bank_date, 0, p.amount
         FROM postings p JOIN accounts a ON a.id = p.credit_account_id WHERE p.currency = ?)
     SELECT code,
       COALESCE(SUM(CASE WHEN bank_date < ? THEN credit - debit END), 0) AS opening,
       COALESCE(SUM(CASE WHEN bank_date BETWEEN ? AND ? THEN debit END), 0) AS debit_turn,
       COALESCE(SUM(CASE WHEN bank_date BETWEEN ? AND ? THEN credit END), 0) AS credit_turn
     FROM moves WHERE bank_date <= ? GROUP BY code ORDER BY code`,
    [currency, currency, from, from, to, from, to, to]);
  const lines = rows.map((r) => {
    const opening = Number(r.opening);
    const debit = Number(r.debit_turn);
    const credit = Number(r.credit_turn);
    return { code: r.code, name: BALANCE_NAMES[r.code] ?? 'Прочие счета', opening, debit, credit, closing: opening + credit - debit };
  });
  const total = lines.reduce((t, l) => ({ opening: t.opening + l.opening, debit: t.debit + l.debit, credit: t.credit + l.credit, closing: t.closing + l.closing }),
    { opening: 0, debit: 0, credit: 0, closing: 0 });
  return { from, to, currency, lines, total, balanced: total.debit === total.credit && total.opening === 0 && total.closing === 0 };
}

/** CSV ведомости: разделитель «;», числа с десятичной запятой, чтобы файл открывался в Excel. */
export function trialBalanceCsv(report) {
  const n = (minor) => (minor / 100).toFixed(2).replace('.', ',');
  const rows = [['Счёт', 'Название', 'Остаток на начало', 'Оборот Дт', 'Оборот Кт', 'Остаток на конец']];
  for (const l of report.lines) rows.push([l.code, l.name, n(l.opening), n(l.debit), n(l.credit), n(l.closing)]);
  rows.push(['', 'Итого', n(report.total.opening), n(report.total.debit), n(report.total.credit), n(report.total.closing)]);
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

/** Показатели кредитного портфеля, вкладов, оборотов и доходов. */
export async function portfolio() {
  const today = await bankDate();
  const { rows: [loans] } = await query(
    `SELECT count(*) AS cnt, COALESCE(sum(principal_balance), 0) AS principal FROM loans WHERE status = 'active'`);
  const { rows: overdue } = await query(
    `SELECT l.id, l.principal_balance, min(s.due_date) AS first_due
     FROM loans l JOIN loan_schedule s ON s.loan_id = l.id AND s.status = 'overdue' WHERE l.status = 'active' GROUP BY l.id`);
  const buckets = [['1-30 дней', 1, 30], ['31-60 дней', 31, 60], ['61-90 дней', 61, 90], ['Более 90 дней', 91, 100000]].map(([name, min, max]) => ({ name, min, max, count: 0, principal: 0 }));
  const dayMs = 86400000;
  let overduePrincipal = 0;
  for (const o of overdue) {
    const dpd = Math.round((Date.parse(today) - Date.parse(String(o.first_due).slice(0, 10))) / dayMs);
    overduePrincipal += Number(o.principal_balance);
    const b = buckets.find((x) => dpd >= x.min && dpd <= x.max);
    if (b) { b.count += 1; b.principal += Number(o.principal_balance); }
  }
  const principal = Number(loans.principal);
  const { rows: deposits } = await query(
    `SELECT d.currency, count(*) AS cnt, COALESCE(sum(a.balance), 0) AS total
     FROM deposits d JOIN accounts a ON a.id = d.account_id WHERE d.status = 'active' GROUP BY d.currency ORDER BY d.currency`);
  const since = addDays(today, -30);
  const { rows: [ops] } = await query(
    `SELECT count(DISTINCT d.id) AS cnt FROM documents d WHERE d.bank_date >= ? AND d.type IN ('transfer_own', 'transfer_client', 'payment', 'card_purchase')`, [since]);
  const { rows: byType } = await query(
    `SELECT d.type, count(*) AS cnt, COALESCE(sum(CASE WHEN p.currency = 'BYN' THEN p.amount END), 0) AS byn
     FROM documents d JOIN postings p ON p.document_id = d.id WHERE d.bank_date >= ? GROUP BY d.type ORDER BY cnt DESC`, [since]);
  const { rows: income } = await query(
    `SELECT currency, balance FROM accounts WHERE purpose = 'income' AND balance <> 0 ORDER BY currency`);
  const { rows: expense } = await query(
    `SELECT currency, balance FROM accounts WHERE purpose = 'expense' AND balance <> 0 ORDER BY currency`);
  return {
    today,
    loans: { count: loans.cnt, principal, overduePrincipal, overdueShare: principal ? Math.round((overduePrincipal / principal) * 1000) / 10 : 0, buckets },
    deposits: deposits.map((d) => ({ currency: d.currency, count: d.cnt, total: Number(d.total) })),
    operations: { count30: ops.cnt, byType: byType.map((t) => ({ type: t.type, count: t.cnt, byn: Number(t.byn) })) },
    income: income.map((i) => ({ currency: i.currency, amount: Number(i.balance) })),
    expense: expense.map((i) => ({ currency: i.currency, amount: -Number(i.balance) }))
  };
}
