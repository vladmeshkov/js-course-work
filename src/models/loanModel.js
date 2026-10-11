import { query } from '../db/pool.js';

export async function listProducts(db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_products WHERE active ORDER BY id');
  return rows;
}

export async function findProduct(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_products WHERE id = $1 AND active', [id]);
  return rows[0];
}

export async function insertApplication(db, a) {
  const { rows } = await db.query(
    `INSERT INTO loan_applications (client_id, product_id, target_account_id, amount, term_months, schedule_type, rate_percent,
       income, obligations, experience_months, dependents, first_payment, dti_percent, score, scoring_notes, status, decision_comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [a.clientId, a.productId, a.targetAccountId, a.amount, a.termMonths, a.scheduleType, a.rate, a.income, a.obligations,
      a.experienceMonths, a.dependents, a.firstPayment, a.dti, a.score, JSON.stringify(a.notes), a.status, a.comment ?? null]
  );
  return rows[0];
}

const APP_SELECT = `
  SELECT a.*, p.name AS product_name, c.last_name, c.first_name, c.patronymic, c.birth_date
  FROM loan_applications a JOIN loan_products p ON p.id = a.product_id JOIN clients c ON c.id = a.client_id`;

export async function findApplication(id, db = { query }) {
  const { rows } = await db.query(`${APP_SELECT} WHERE a.id = $1`, [id]);
  return rows[0];
}

export async function lockApplication(db, id) {
  const { rows } = await db.query('SELECT * FROM loan_applications WHERE id = $1 FOR UPDATE', [id]);
  return rows[0];
}

export async function listApplicationsByClient(clientId) {
  const { rows } = await query(`${APP_SELECT} WHERE a.client_id = $1 ORDER BY a.id DESC`, [clientId]);
  return rows;
}

export async function listByStatus(status) {
  const { rows } = await query(`${APP_SELECT} WHERE a.status = $1 ORDER BY a.id`, [status]);
  return rows;
}

export async function decideApplication(db, id, { status, comment, userId }) {
  await db.query(
    'UPDATE loan_applications SET status = $2, decision_comment = $3, decided_by = $4, decided_at = now() WHERE id = $1',
    [id, status, comment, userId]
  );
}

export async function setApplicationStatus(db, id, status) {
  await db.query('UPDATE loan_applications SET status = $2 WHERE id = $1', [id, status]);
}

export async function insertLoan(db, l) {
  const { rows } = await db.query(
    `INSERT INTO loans (application_id, client_id, account_id, payout_account_id, amount, rate_percent, term_months,
       schedule_type, opened_date, principal_balance, last_paid_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$5,$9) RETURNING *`,
    [l.applicationId, l.clientId, l.accountId, l.payoutAccountId, l.amount, l.rate, l.termMonths, l.scheduleType, l.openedDate]
  );
  return rows[0];
}

export async function insertInstallments(db, loanId, rows) {
  for (const r of rows) {
    await db.query(
      'INSERT INTO loan_schedule (loan_id, no, due_date, principal, interest) VALUES ($1, $2, $3, $4, $5)',
      [loanId, r.no, r.dueDate, r.principal, r.interest]
    );
  }
}

export async function listLoansByClient(clientId) {
  const { rows } = await query(
    `SELECT l.*, (SELECT min(due_date) FROM loan_schedule s WHERE s.loan_id = l.id AND s.status IN ('planned', 'overdue')) AS next_due
     FROM loans l WHERE l.client_id = $1 ORDER BY (l.status = 'active') DESC, l.id DESC`,
    [clientId]
  );
  return rows;
}

export async function findLoanForClient(id, clientId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loans WHERE id = $1 AND client_id = $2', [id, clientId]);
  return rows[0];
}

export async function lockLoan(db, id) {
  const { rows } = await db.query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id]);
  return rows[0];
}

export async function schedule(loanId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_schedule WHERE loan_id = $1 AND status <> \'cancelled\' ORDER BY no', [loanId]);
  return rows;
}

export async function lockActiveLoans(db) {
  const { rows } = await db.query("SELECT l.*, (SELECT user_id FROM clients c WHERE c.id = l.client_id) AS user_id FROM loans l WHERE l.status = 'active' ORDER BY l.id FOR UPDATE OF l");
  return rows;
}

export async function dueInstallments(db, loanId, date) {
  const { rows } = await db.query(
    "SELECT * FROM loan_schedule WHERE loan_id = $1 AND status IN ('planned', 'overdue') AND due_date <= $2 ORDER BY no FOR UPDATE",
    [loanId, date]
  );
  return rows;
}

export async function markInstallment(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await db.query(`UPDATE loan_schedule SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function updateLoan(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await db.query(`UPDATE loans SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function cancelPlanned(db, loanId) {
  await db.query("UPDATE loan_schedule SET status = 'cancelled' WHERE loan_id = $1 AND status IN ('planned', 'overdue')", [loanId]);
}

export async function deletePlanned(db, loanId) {
  await db.query("DELETE FROM loan_schedule WHERE loan_id = $1 AND status = 'planned'", [loanId]);
}
