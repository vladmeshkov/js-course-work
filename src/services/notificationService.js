import { query } from '../db/pool.js';
import { formatAmount } from '../lib/money.js';

/*
 * Уведомления клиента и сотрудника внутри кабинета. Создаются в той же транзакции, что и событие,
 * поэтому уведомление не появится, если операция откатилась.
 * В боевой системе тут же уходили бы SMS и письма: точка расширения — функция notify.
 */

export const money = (minor, currency = 'BYN') => `${formatAmount(minor)} ${currency}`;

/**
 * @param {number | null} userId получатель (null: ничего не делаем)
 * @param {{type:string, title:string, body?:string, link?:string}} n
 * @param {{query: Function}} [db] клиент транзакции
 */
export async function notify(userId, { type, title, body = '', link = null }, db = { query }) {
  if (!userId) return;
  await db.query('INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)', [userId, type, title, body, link]);
}

/** Уведомление владельцу счёта (если владелец клиент банка). */
export async function notifyAccountOwner(accountId, n, db = { query }) {
  const { rows } = await db.query(
    'SELECT c.user_id FROM accounts a JOIN clients c ON c.id = a.owner_client_id WHERE a.id = $1', [accountId]);
  if (rows[0]) await notify(rows[0].user_id, n, db);
}

export async function unreadCount(userId, db = { query }) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return rows[0].n;
}

export async function list(userId, limit = 100) {
  const { rows } = await query(
    'SELECT id, type, title, body, link, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [userId, limit]);
  return rows;
}

export async function markAllRead(userId) {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

export async function markRead(userId, id) {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = $2 AND read_at IS NULL', [userId, id]);
}
