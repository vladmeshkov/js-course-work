import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';

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

export async function setStatus(id, status, db = { query }) {
  await db.query('UPDATE transfer_intents SET status = ? WHERE id = ?', [status, id]);
}

/** Сумма переводов клиента другим клиентам за банковскую дату, в BYN. */
export async function sentTodayByn(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount_byn), 0) AS total FROM transfer_intents
     WHERE user_id = ? AND kind = 'client' AND status = 'confirmed' AND bank_date = (SELECT bank_date FROM bank_state)`,
    [userId]
  );
  return Number(rows[0].total);
}
