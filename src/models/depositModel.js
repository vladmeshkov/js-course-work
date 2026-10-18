import { query } from '../db/pool.js';

export async function listProducts(db = { query }) {
  const { rows } = await db.query('SELECT * FROM deposit_products WHERE active ORDER BY currency, term_months, id');
  return rows;
}

export async function findProduct(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM deposit_products WHERE id = ? AND active', [id]);
  return rows[0];
}

export async function insert(db, d) {
  const { insertId } = await db.query(
    `INSERT INTO deposits (client_id, product_id, account_id, payout_account_id, currency, amount, rate_percent,
       demand_rate_percent, capitalization, revocable, opened_date, maturity_date, paid_until)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.clientId, d.productId, d.accountId, d.payoutAccountId, d.currency, d.amount, d.rate, d.demandRate,
      d.capitalization, d.revocable, d.openedDate, d.maturityDate, d.openedDate]
  );
  return (await db.query('SELECT * FROM deposits WHERE id = ?', [insertId])).rows[0];
}

export async function listByClient(clientId) {
  const { rows } = await query(
    `SELECT d.*, p.name AS product_name, a.balance FROM deposits d
     JOIN deposit_products p ON p.id = d.product_id JOIN accounts a ON a.id = d.account_id
     WHERE d.client_id = ? ORDER BY (d.status = 'active') DESC, d.id DESC`,
    [clientId]
  );
  return rows;
}

export async function findForClient(id, clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT d.*, p.name AS product_name, a.balance FROM deposits d
     JOIN deposit_products p ON p.id = d.product_id JOIN accounts a ON a.id = d.account_id
     WHERE d.id = ? AND d.client_id = ?`,
    [id, clientId]
  );
  return rows[0];
}

export async function lockActiveDue(db, bankDate) {
  const { rows } = await db.query(
    `SELECT d.*, (SELECT user_id FROM clients c WHERE c.id = d.client_id) AS user_id FROM deposits d WHERE d.status = 'active' AND d.paid_until < ? ORDER BY d.id FOR UPDATE OF d`,
    [bankDate]
  );
  return rows;
}

export async function lock(db, id) {
  const { rows } = await db.query('SELECT * FROM deposits WHERE id = ? FOR UPDATE', [id]);
  return rows[0];
}

export async function saveProgress(db, id, { paidUntil, periodsDone, interestTotal }) {
  await db.query('UPDATE deposits SET paid_until = ?, periods_done = ?, interest_total = ? WHERE id = ?', [paidUntil, periodsDone, interestTotal, id]);
}

export async function close(db, id, status, closedDate, interestTotal) {
  await db.query('UPDATE deposits SET status = ?, closed_date = ?, interest_total = ? WHERE id = ?', [status, closedDate, interestTotal, id]);
}

export async function closeAccount(db, accountId) {
  await db.query("UPDATE accounts SET status = 'closed', closed_at = UTC_TIMESTAMP(3) WHERE id = ?", [accountId]);
}
