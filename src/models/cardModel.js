import { query } from '../db/pool.js';

const COLUMNS = `c.id, c.client_id, c.account_id, c.\`system\`, c.last4, c.holder, c.expires, c.status, c.per_op_limit, c.daily_limit,
  c.monthly_limit, c.online_enabled, c.issued_at, a.title AS account_title, a.currency, a.iban`;

export async function insert(db, c) {
  const { insertId } = await db.query(
    `INSERT INTO cards (client_id, account_id, \`system\`, number_enc, number_hash, last4, holder, expires, cvv_hash, pin_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [c.clientId, c.accountId, c.system, c.numberEnc, c.numberHash, c.last4, c.holder, c.expires, c.cvvHash, c.pinHash]
  );
  return insertId;
}

export async function listByClient(clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM cards c JOIN accounts a ON a.id = c.account_id
     WHERE c.client_id = ? AND c.status <> 'closed' ORDER BY c.id`,
    [clientId]
  );
  return rows;
}

export async function findForClient(id, clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM cards c JOIN accounts a ON a.id = c.account_id WHERE c.id = ? AND c.client_id = ?`,
    [id, clientId]
  );
  return rows[0];
}

export async function lock(db, id) {
  const { rows } = await db.query('SELECT * FROM cards WHERE id = ? FOR UPDATE', [id]);
  return rows[0];
}

export async function numberExists(hash, db = { query }) {
  const { rowCount } = await db.query('SELECT 1 FROM cards WHERE number_hash = ?', [hash]);
  return rowCount > 0;
}

export async function setStatus(db, id, status) {
  await db.query('UPDATE cards SET status = ? WHERE id = ?', [status, id]);
}

export async function setLimits(db, id, l) {
  await db.query('UPDATE cards SET per_op_limit = ?, daily_limit = ?, monthly_limit = ?, online_enabled = ? WHERE id = ?',
    [l.perOp, l.daily, l.monthly, l.online, id]);
}

export async function spent(db, cardId, fromDate, toDate) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM card_operations WHERE card_id = ? AND bank_date >= ? AND bank_date < ?',
    [cardId, fromDate, toDate]
  );
  return Number(rows[0].total);
}

export async function insertOperation(db, o) {
  await db.query(
    'INSERT INTO card_operations (card_id, document_id, amount, online, place, bank_date) VALUES (?,?,?,?,?,(SELECT bank_date FROM bank_state))',
    [o.cardId, o.documentId, o.amount, o.online, o.place]
  );
}

export async function recentOperations(cardId, limit = 20, db = { query }) {
  const { rows } = await db.query(
    'SELECT amount, online, place, bank_date FROM card_operations WHERE card_id = ? ORDER BY id DESC LIMIT ?', [cardId, limit]);
  return rows;
}
