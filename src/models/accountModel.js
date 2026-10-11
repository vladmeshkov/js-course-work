import { query } from '../db/pool.js';

const COLUMNS = `id, iban, owner_client_id, balance_code, kind, title, purpose, currency, status, balance, min_balance, opened_at`;

export async function nextNumber(db) {
  const { rows } = await db.query("SELECT nextval('account_number_seq') AS n");
  return Number(rows[0].n);
}

export async function insert(db, a) {
  const { rows } = await db.query(
    `INSERT INTO accounts (iban, owner_client_id, balance_code, kind, title, purpose, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [a.iban, a.ownerClientId ?? null, a.balanceCode, a.kind, a.title, a.purpose ?? null, a.currency]
  );
  return rows[0];
}

export async function listByClient(clientId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM accounts WHERE owner_client_id = $1 AND status <> 'closed' ORDER BY id`,
    [clientId]
  );
  return rows;
}

export async function findByIban(iban) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM accounts WHERE iban = $1`, [iban]);
  return rows[0];
}

export async function findByPurpose(db, purpose, currency) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM accounts WHERE purpose = $1 AND currency = $2`, [purpose, currency]);
  return rows[0];
}

/**
 * Блокирует строки счетов в порядке возрастания id (защита от взаимных блокировок).
 * @returns {Promise<Map<number, any>>}
 */
export async function lockAll(db, ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
    [sorted]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export async function heldAmount(db, accountId) {
  const { rows } = await db.query(
    "SELECT COALESCE(SUM(amount), 0) AS held FROM holds WHERE account_id = $1 AND status = 'active'",
    [accountId]
  );
  return Number(rows[0].held);
}

export async function addToBalance(db, accountId, delta) {
  await db.query('UPDATE accounts SET balance = balance + $2 WHERE id = $1', [accountId, delta]);
}

export async function findById(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM accounts WHERE id = $1`, [id]);
  return rows[0];
}

/** Последние операции по счёту: сумма со знаком относительно этого счёта. */
export async function operations(accountId, limit = 50) {
  const { rows } = await query(
    `SELECT p.id, p.currency, d.type, d.description, d.created_at, d.bank_date,
            CASE WHEN p.credit_account_id = $1 THEN p.amount ELSE -p.amount END AS signed
     FROM postings p JOIN documents d ON d.id = p.document_id
     WHERE p.credit_account_id = $1 OR p.debit_account_id = $1
     ORDER BY p.id DESC LIMIT $2`,
    [accountId, limit]
  );
  return rows;
}
