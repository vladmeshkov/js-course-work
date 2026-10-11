import { withTransaction } from '../db/pool.js';
import { addDays } from '../lib/dates.js';
import { BusinessError } from '../lib/errors.js';
import * as auditService from './auditService.js';
import * as depositService from './depositService.js';
import * as loanService from './loanService.js';
import * as paymentService from './paymentService.js';
import * as ledgerService from './ledgerService.js';

/*
 * Закрытие операционного дня. Банковская дата переводится на +1 день,
 * после чего выполняются процедуры, срок которых наступил к новой дате.
 * Порядок шагов (по мере появления модулей): вклады, кредиты, пеня, автоплатежи, холды,
 * контроль оборотно-сальдовой ведомости.
 */

/**
 * @param {number} userId
 * @returns {Promise<{date:string, deposits:{payouts:number, matured:number}, loans:{paid:number, overdue:number, closed:number}}>}
 */
export function closeDay(userId) {
  return withTransaction(async (db) => {
    const { rows: [state] } = await db.query('SELECT bank_date FROM bank_state FOR UPDATE');
    const date = addDays(state.bank_date, 1);
    await db.query('UPDATE bank_state SET bank_date = $1', [date]);

    const deposits = await depositService.processDeposits(db, date);
    const loans = await loanService.processLoans(db, date);
    const autopayments = await paymentService.processAutopayments(db, date);
    const reminders = await loanService.sendReminders(db, date);

    for (const row of await ledgerService.trialBalance(db)) {
      if (!row.ok) throw new BusinessError(`Нарушена двойная запись в валюте ${row.currency}: день не закрыт`);
    }
    await auditService.log({ userId, action: 'eod.close_day', details: { date, deposits, loans, autopayments, reminders } }, db);
    return { date, deposits, loans, autopayments };
  });
}

/** Для демонстрации: закрывает подряд несколько дней. */
export async function advanceDays(userId, days) {
  let last;
  for (let i = 0; i < days; i++) last = await closeDay(userId);
  return last;
}

export async function currentBankDate(db) {
  const { rows } = await db.query('SELECT bank_date FROM bank_state');
  return rows[0].bank_date;
}
