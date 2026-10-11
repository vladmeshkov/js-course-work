import { query } from '../db/pool.js';

export async function listProducts(db = { query }) {
  const { rows } = await db.query('SELECT * FROM deposit_products WHERE active ORDER BY currency, term_months, id');
  return rows;
}

export async function findProduct(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM deposit_products WHERE id = $1 AND active', [id]);
  return rows[0];
}

export async function insert(db, d) {
  const { rows } = await db.query(
    `INSERT INTO deposits (client_id, product_id, account_id, payout_account_id, currency, amount, rate_percent,
       demand_rate_percent, capitalization, revocable, opened_date, maturity_date, paid_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$11) RETURNING *`,
    [d.clientId, d.productId, d.accountId, d.payoutAccountId, d.currency, d.amount, d.rate, d.demandRate,
      d.capitalization, d.revocable, d.openedDate, d.maturityDate]
  );
  return rows[0];
}

export async function listByClient(clientId) {
  const { rows } = await query(
    `SELECT d.*, p.name AS product_name, a.balance FROM deposits d
     JOIN deposit_products p ON p.id = d.product_id JOIN accounts a ON a.id = d.account_id
     WHERE d.client_id = $1 ORDER BY (d.status = 'active') DESC, d.id DESC`,
    [clientId]
  );
  return rows;
}

export async function findForClient(id, clientId, db = { query }) {
  const { rows } = await db.query(
    `SELECT d.*, p.name AS product_name, a.balance FROM deposits d
     JOIN deposit_products p ON p.id = d.product_id JOIN accounts a ON a.id = d.account_id
     WHERE d.id = $1 AND d.client_id = $2`,
    [id, clientId]
  );
  return rows[0];
}

export async function lockActiveDue(db, bankDate) {
  const { rows } = await db.query(
    `SELECT * FROM deposits WHERE status = 'active' AND paid_until < $1 ORDER BY id FOR UPDATE`,
    [bankDate]
  );
  return rows;
}

export async function lock(db, id) {
  const { rows } = await db.query('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [id]);
  return rows[0];
}

export async function saveProgress(db, id, { paidUntil, periodsDone, interestTotal }) {
  await db.query('UPDATE deposits SET paid_until = $2, periods_done = $3, interest_total = $4 WHERE id = $1', [id, paidUntil, periodsDone, interestTotal]);
}

export async function close(db, id, status, closedDate, interestTotal) {
  await db.query('UPDATE deposits SET status = $2, closed_date = $3, interest_total = $4 WHERE id = $1', [id, status, closedDate, interestTotal]);
}

export async function closeAccount(db, accountId) {
  await db.query("UPDATE accounts SET status = 'closed', closed_at = now() WHERE id = $1", [accountId]);
}
