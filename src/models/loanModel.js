import { query } from '../db/pool.js';

export async function listProducts(db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_products WHERE active ORDER BY id');
  return rows;
}

export async function findProduct(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_products WHERE id = ? AND active', [id]);
  return rows[0];
}

export async function insertApplication(db, a) {
  const { insertId } = await db.query(
    `INSERT INTO loan_applications (client_id, product_id, target_account_id, amount, term_months, schedule_type, rate_percent,
       income, obligations, experience_months, dependents, first_payment, dti_percent, score, scoring_notes, status, decision_comment, pd_percent, model_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.clientId, a.productId, a.targetAccountId, a.amount, a.termMonths, a.scheduleType, a.rate, a.income, a.obligations,
      a.experienceMonths, a.dependents, a.firstPayment, a.dti, a.score, JSON.stringify(a.notes), a.status, a.comment ?? null, a.pdPercent ?? null, a.modelVersion ?? null]
  );
  return findApplication(insertId, db);
}

const APP_SELECT = `
  SELECT a.*, p.name AS product_name, c.last_name, c.first_name, c.patronymic, c.birth_date
  FROM loan_applications a JOIN loan_products p ON p.id = a.product_id JOIN clients c ON c.id = a.client_id`;

export async function findApplication(id, db = { query }) {
  const { rows } = await db.query(`${APP_SELECT} WHERE a.id = ?`, [id]);
  return rows[0];
}

export async function lockApplication(db, id) {
  const { rows } = await db.query('SELECT * FROM loan_applications WHERE id = ? FOR UPDATE', [id]);
  return rows[0];
}

export async function listApplicationsByClient(clientId) {
  const { rows } = await query(`${APP_SELECT} WHERE a.client_id = ? ORDER BY a.id DESC`, [clientId]);
  return rows;
}

export async function listByStatus(status) {
  const { rows } = await query(`${APP_SELECT} WHERE a.status = ? ORDER BY a.id`, [status]);
  return rows;
}

export async function decideApplication(db, id, { status, comment, userId }) {
  await db.query(
    'UPDATE loan_applications SET status = ?, decision_comment = ?, decided_by = ?, decided_at = UTC_TIMESTAMP(3) WHERE id = ?',
    [status, comment, userId, id]
  );
}

export async function setApplicationStatus(db, id, status) {
  await db.query('UPDATE loan_applications SET status = ? WHERE id = ?', [status, id]);
}

export async function insertLoan(db, l) {
  const { insertId } = await db.query(
    `INSERT INTO loans (application_id, client_id, account_id, payout_account_id, amount, rate_percent, term_months,
       schedule_type, opened_date, principal_balance, last_paid_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [l.applicationId, l.clientId, l.accountId, l.payoutAccountId, l.amount, l.rate, l.termMonths, l.scheduleType, l.openedDate, l.amount, l.openedDate]
  );
  return (await db.query('SELECT * FROM loans WHERE id = ?', [insertId])).rows[0];
}

export async function insertInstallments(db, loanId, rows) {
  for (const r of rows) {
    await db.query(
      'INSERT INTO loan_schedule (loan_id, no, due_date, principal, interest) VALUES (?, ?, ?, ?, ?)',
      [loanId, r.no, r.dueDate, r.principal, r.interest]
    );
  }
}

export async function listLoansByClient(clientId) {
  const { rows } = await query(
    `SELECT l.*, (SELECT min(due_date) FROM loan_schedule s WHERE s.loan_id = l.id AND s.status IN ('planned', 'overdue')) AS next_due
     FROM loans l WHERE l.client_id = ? ORDER BY (l.status = 'active') DESC, l.id DESC`,
    [clientId]
  );
  return rows;
}

export async function findLoanForClient(id, clientId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loans WHERE id = ? AND client_id = ?', [id, clientId]);
  return rows[0];
}

export async function lockLoan(db, id) {
  const { rows } = await db.query('SELECT * FROM loans WHERE id = ? FOR UPDATE', [id]);
  return rows[0];
}

export async function schedule(loanId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM loan_schedule WHERE loan_id = ? AND status <> \'cancelled\' ORDER BY no', [loanId]);
  return rows;
}

export async function lockActiveLoans(db) {
  const { rows } = await db.query("SELECT l.*, (SELECT user_id FROM clients c WHERE c.id = l.client_id) AS user_id FROM loans l WHERE l.status = 'active' ORDER BY l.id FOR UPDATE OF l");
  return rows;
}

export async function dueInstallments(db, loanId, date) {
  const { rows } = await db.query(
    "SELECT * FROM loan_schedule WHERE loan_id = ? AND status IN ('planned', 'overdue') AND due_date <= ? ORDER BY no FOR UPDATE",
    [loanId, date]
  );
  return rows;
}

export async function markInstallment(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await db.query(`UPDATE loan_schedule SET ${sets} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}

export async function updateLoan(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await db.query(`UPDATE loans SET ${sets} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}

export async function cancelPlanned(db, loanId) {
  await db.query("UPDATE loan_schedule SET status = 'cancelled' WHERE loan_id = ? AND status IN ('planned', 'overdue')", [loanId]);
}

export async function deletePlanned(db, loanId) {
  await db.query("DELETE FROM loan_schedule WHERE loan_id = ? AND status = 'planned'", [loanId]);
}
