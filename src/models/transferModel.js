import { query } from '../db/pool.js';

export async function insertIntent(db, t) {
  const { rows } = await db.query(
    `INSERT INTO transfer_intents (user_id, kind, from_account_id, to_account_id, amount, amount_byn, fee, comment, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '10 minutes') RETURNING *`,
    [t.userId, t.kind, t.fromAccountId, t.toAccountId, t.amount, t.amountByn, t.fee, t.comment]
  );
  return rows[0];
}

export async function findIntent(id, userId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM transfer_intents WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0];
}

export async function lockIntent(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM transfer_intents WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
  return rows[0];
}

export async function markConfirmed(db, id, documentId) {
  await db.query(
    `UPDATE transfer_intents SET status = 'confirmed', document_id = $2, bank_date = (SELECT bank_date FROM bank_state) WHERE id = $1`,
    [id, documentId]
  );
}

export async function setStatus(id, status, db = { query }) {
  await db.query('UPDATE transfer_intents SET status = $2 WHERE id = $1', [id, status]);
}

/** Сумма переводов клиента другим клиентам за банковскую дату, в BYN. */
export async function sentTodayByn(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount_byn), 0) AS total FROM transfer_intents
     WHERE user_id = $1 AND kind = 'client' AND status = 'confirmed' AND bank_date = (SELECT bank_date FROM bank_state)`,
    [userId]
  );
  return Number(rows[0].total);
}
