import { query } from '../db/pool.js';

const COLUMNS = `id, iban, owner_client_id, balance_code, kind, title, purpose, currency, status, balance, min_balance, opened_at`;

export async function nextNumber(db) {
  const { insertId } = await db.query('INSERT INTO account_number_seq () VALUES ()');
  return insertId;
}

export async function insert(db, a) {
  const { insertId } = await db.query(
    `INSERT INTO accounts (iban, owner_client_id, balance_code, kind, title, purpose, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.iban, a.ownerClientId ?? null, a.balanceCode, a.kind, a.title, a.purpose ?? null, a.currency]
  );
  return findById(insertId, db);
}

export async function listByClient(clientId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM accounts WHERE owner_client_id = ? AND status <> 'closed' ORDER BY id`,
    [clientId]
  );
  return rows;
}

export async function findByIban(iban) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM accounts WHERE iban = ?`, [iban]);
  return rows[0];
}

export async function findByPurpose(db, purpose, currency) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM accounts WHERE purpose = ? AND currency = ?`, [purpose, currency]);
  return rows[0];
}

/**
 * Блокирует строки счетов в порядке возрастания id (защита от взаимных блокировок).
 * @returns {Promise<Map<number, any>>}
 */
export async function lockAll(db, ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM accounts WHERE id IN (?) ORDER BY id FOR UPDATE`,
    [sorted]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export async function heldAmount(db, accountId) {
  const { rows } = await db.query(
    "SELECT COALESCE(SUM(amount), 0) AS held FROM holds WHERE account_id = ? AND status = 'active'",
    [accountId]
  );
  return Number(rows[0].held);
}

export async function addToBalance(db, accountId, delta) {
  await db.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [delta, accountId]);
}

export async function findById(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`, [id]);
  return rows[0];
}

/** Последние операции по счёту: сумма со знаком относительно этого счёта. */
export async function operations(accountId, limit = 50) {
  const { rows } = await query(
    `SELECT p.id, p.currency, d.type, d.description, d.created_at, d.bank_date,
            CASE WHEN p.credit_account_id = ? THEN p.amount ELSE -p.amount END AS signed
     FROM postings p JOIN documents d ON d.id = p.document_id
     WHERE p.credit_account_id = ? OR p.debit_account_id = ?
     ORDER BY p.id DESC LIMIT ?`,
    [accountId, accountId, accountId, limit]
  );
  return rows;
}

/** Поиск клиентских счетов по IBAN (часть номера) или логину владельца. */
export async function search(text, limit = 30) {
  const like = `%${String(text).replace(/\s/g, '').toLowerCase()}%`;
  const { rows } = await query(
    `SELECT a.id, a.iban, a.kind, a.title, a.currency, a.status, a.balance, u.login, c.last_name, c.first_name
     FROM accounts a JOIN clients c ON c.id = a.owner_client_id JOIN users u ON u.id = c.user_id
     WHERE a.kind <> 'internal' AND a.status <> 'closed' AND (lower(a.iban) LIKE ? OR lower(u.login) LIKE ?)
     ORDER BY a.id LIMIT ?`, [like, like, limit]);
  return rows;
}

export async function setStatus(db, id, status) {
  await db.query('UPDATE accounts SET status = ? WHERE id = ?', [status, id]);
}
