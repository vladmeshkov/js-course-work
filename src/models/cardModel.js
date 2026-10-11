import { query } from '../db/pool.js';

const COLUMNS = `c.id, c.client_id, c.account_id, c.system, c.last4, c.holder, c.expires, c.status, c.per_op_limit, c.daily_limit,
  c.monthly_limit, c.online_enabled, c.issued_at, a.title AS account_title, a.currency, a.iban`;

export async function insert(db, c) {
  const { rows } = await db.query(
    `INSERT INTO cards (client_id, account_id, system, number_enc, number_hash, last4, holder, expires, cvv_hash, pin_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [c.clientId, c.accountId, c.system, c.numberEnc, c.numberHash, c.last4, c.holder, c.expires, c.cvvHash, c.pinHash]
  );
  return rows[0].id;
}

export async function listByClient(clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM cards c JOIN accounts a ON a.id = c.account_id
     WHERE c.client_id = $1 AND c.status <> 'closed' ORDER BY c.id`,
    [clientId]
  );
  return rows;
}

export async function findForClient(id, clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM cards c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1 AND c.client_id = $2`,
    [id, clientId]
  );
  return rows[0];
}

export async function lock(db, id) {
  const { rows } = await db.query('SELECT * FROM cards WHERE id = $1 FOR UPDATE', [id]);
  return rows[0];
}

export async function numberExists(hash, db = { query }) {
  const { rowCount } = await db.query('SELECT 1 FROM cards WHERE number_hash = $1', [hash]);
  return rowCount > 0;
}

export async function setStatus(db, id, status) {
  await db.query('UPDATE cards SET status = $2 WHERE id = $1', [id, status]);
}

export async function setLimits(db, id, l) {
  await db.query('UPDATE cards SET per_op_limit = $2, daily_limit = $3, monthly_limit = $4, online_enabled = $5 WHERE id = $1',
    [id, l.perOp, l.daily, l.monthly, l.online]);
}

export async function spent(db, cardId, fromDate, toDate) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM card_operations WHERE card_id = $1 AND bank_date >= $2 AND bank_date < $3',
    [cardId, fromDate, toDate]
  );
  return Number(rows[0].total);
}

export async function insertOperation(db, o) {
  await db.query(
    'INSERT INTO card_operations (card_id, document_id, amount, online, place, bank_date) VALUES ($1,$2,$3,$4,$5,(SELECT bank_date FROM bank_state))',
    [o.cardId, o.documentId, o.amount, o.online, o.place]
  );
}

export async function recentOperations(cardId, limit = 20, db = { query }) {
  const { rows } = await db.query(
    'SELECT amount, online, place, bank_date FROM card_operations WHERE card_id = $1 ORDER BY id DESC LIMIT $2', [cardId, limit]);
  return rows;
}
