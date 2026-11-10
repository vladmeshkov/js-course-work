import { query } from '../db/pool.js';

/**
 * Текущая банковская дата «ГГГГ-ММ-ДД» (таблица bank_state). Её сдвигает только закрытие операционного дня,
 * все операции и начисления проводятся по ней, а не по часам сервера.
 * @param {{query: Function}} [db] соединение транзакции, если дата нужна внутри неё
 * @returns {Promise<string>}
 */
export async function currentBankDate(db = { query }) {
  const { rows } = await db.query('SELECT bank_date FROM bank_state');
  return String(rows[0].bank_date).slice(0, 10);
}
