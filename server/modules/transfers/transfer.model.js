import { randomUUID } from 'node:crypto';
import { query } from '../../db/pool.js';

export async function insertIntent(db, t) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO transfer_intents (id, user_id, kind, from_account_id, to_account_id, amount, amount_byn, fee, comment, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL 10 MINUTE)`,
    [id, t.userId, t.kind, t.fromAccountId, t.toAccountId, t.amount, t.amountByn, t.fee, t.comment]
  );
  return (await db.query('SELECT * FROM transfer_intents WHERE id = ?', [id])).rows[0];
}

export async function findIntent(id, userId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM transfer_intents WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0];
}

export async function lockIntent(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM transfer_intents WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
  return rows[0];
}

export async function markConfirmed(db, id, documentId) {
  await db.query(
    `UPDATE transfer_intents SET status = 'confirmed', document_id = ?, bank_date = (SELECT bank_date FROM bank_state) WHERE id = ?`,
    [documentId, id]
  );
}

/**
 * Меняет статус, только если заявка ещё в ожидаемом статусе. Возвращает true, если статус изменён:
 * так параллельные «подтвердить» и «отменить» не перезаписывают друг друга.
 */
export async function transition(id, from, to, db = { query }) {
  const { rowCount } = await db.query('UPDATE transfer_intents SET status = ? WHERE id = ? AND status = ?', [to, id, from]);
  return rowCount > 0;
}

/**
 * Блокирует строку пользователя до конца транзакции. Проверка суточного лимита и проводка
 * одного клиента идут по очереди, иначе параллельные переводы проходят проверку одновременно.
 */
export async function lockUser(db, userId) {
  await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
}

/**
 * Переводы клиента другим лицам за банковскую дату, в BYN: проведённые переводы клиентам банка,
 * задержанные на проверку, а также переводы в другие банки, которые ждут клиринга или уже отправлены сегодня.
 */
export async function sentTodayByn(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(amount_byn), 0) FROM transfer_intents
        WHERE user_id = ? AND kind = 'client'
          AND (status = 'review' OR (status = 'confirmed' AND bank_date = (SELECT bank_date FROM bank_state))))
     + (SELECT COALESCE(SUM(amount), 0) FROM interbank_transfers
        WHERE user_id = ? AND direction = 'out'
          AND (status IN ('queued', 'review') OR (status = 'sent' AND sent_date = (SELECT bank_date FROM bank_state)))) AS total`,
    [userId, userId]
  );
  return Number(rows[0].total);
}
