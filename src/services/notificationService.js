import { query } from '../db/pool.js';
import { formatAmount } from '../lib/money.js';
import * as mailService from './mailService.js';

/*
 * Уведомления клиента и сотрудника внутри кабинета. Создаются в той же транзакции, что и событие,
 * поэтому уведомление не появится, если операция откатилась.
 * Если настроена почта (SMTP_HOST), уведомление ставится в очередь писем mailService.enqueue в той же транзакции.
 */

export const money = (minor, currency = 'BYN') => `${formatAmount(minor)} ${currency}`;

/**
 * @param {number | null} userId получатель (null: ничего не делаем)
 * @param {{type:string, title:string, body?:string, link?:string}} n
 * @param {{query: Function}} [db] клиент транзакции
 */
export async function notify(userId, { type, title, body = '', link = null }, db = { query }) {
  if (!userId) return;
  await db.query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)', [userId, type, title, body, link]);
  await mailService.enqueue(userId, { title, body }, db);
}

/** Уведомление владельцу счёта (если владелец клиент банка). */
export async function notifyAccountOwner(accountId, n, db = { query }) {
  const { rows } = await db.query(
    'SELECT c.user_id FROM accounts a JOIN clients c ON c.id = a.owner_client_id WHERE a.id = ?', [accountId]);
  if (rows[0]) await notify(rows[0].user_id, n, db);
}

export async function unreadCount(userId, db = { query }) {
  const { rows } = await db.query('SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  return rows[0].n;
}

export async function list(userId, limit = 100) {
  const { rows } = await query(
    'SELECT id, type, title, body, link, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, limit]);
  return rows;
}

export async function markAllRead(userId) {
  await query('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL', [userId]);
}

export async function markRead(userId, id) {
  await query('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND id = ? AND read_at IS NULL', [userId, id]);
}
