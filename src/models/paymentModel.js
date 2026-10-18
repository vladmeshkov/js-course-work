import { query } from '../db/pool.js';

export const categories = async () => (await query(
  `SELECT c.*, (SELECT count(*) FROM payment_providers p WHERE p.category_id = c.id AND p.active) AS count
   FROM payment_categories c ORDER BY c.sort, c.id`)).rows;

export async function category(id) {
  return (await query('SELECT * FROM payment_categories WHERE id = ?', [id])).rows[0];
}

export async function cities() {
  const { rows } = await query('SELECT DISTINCT city FROM payment_providers WHERE city IS NOT NULL AND active ORDER BY city');
  return rows.map((r) => r.city);
}

/** Поставщики категории: по городу (если задан) и по части названия. Поставщики «во всех городах» видны всегда. */
export async function providers({ categoryId, city, q }) {
  const params = [];
  const where = ['p.active'];
  if (categoryId) { params.push(categoryId); where.push('p.category_id = ?'); }
  if (city) { params.push(city); where.push('(p.city IS NULL OR p.city = ?)'); }
  if (q) { const like = `%${q.toLowerCase()}%`; params.push(like, like); where.push('(lower(p.name) LIKE ? OR lower(c.name) LIKE ?)'); }
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name FROM payment_providers p JOIN payment_categories c ON c.id = p.category_id
     WHERE ${where.join(' AND ')} ORDER BY p.name`, params);
  return rows;
}

export async function provider(id, db = { query }) {
  const { rows } = await db.query(
    'SELECT p.*, c.name AS category_name FROM payment_providers p JOIN payment_categories c ON c.id = p.category_id WHERE p.id = ? AND p.active', [id]);
  return rows[0];
}

export async function insertPayment(db, p) {
  const { insertId } = await db.query(
    `INSERT INTO payments (client_id, provider_id, from_account_id, amount, fee, requisite, document_id, source, bank_date)
     VALUES (?,?,?,?,?,?,?,?,(SELECT bank_date FROM bank_state))`,
    [p.clientId, p.providerId, p.fromAccountId, p.amount, p.fee, p.requisite, p.documentId, p.source]
  );
  return (await db.query('SELECT * FROM payments WHERE id = ?', [insertId])).rows[0];
}

export async function recent(clientId, limit = 10) {
  const { rows } = await query(
    `SELECT pay.*, pr.name AS provider_name FROM payments pay JOIN payment_providers pr ON pr.id = pay.provider_id
     WHERE pay.client_id = ? ORDER BY pay.id DESC LIMIT ?`, [clientId, limit]);
  return rows;
}

/** Прошлые платежи клиента одному получателю (для правой колонки формы оплаты). */
export async function historyFor(clientId, providerId, limit = 3) {
  const { rows } = await query(
    'SELECT id, amount, fee, bank_date FROM payments WHERE client_id = ? AND provider_id = ? ORDER BY id DESC LIMIT ?', [clientId, providerId, limit]);
  return rows;
}

export async function receipt(id, clientId) {
  const { rows } = await query(
    `SELECT pay.*, pr.name AS provider_name, pr.requisite_label, c.name AS category_name, a.iban
     FROM payments pay JOIN payment_providers pr ON pr.id = pay.provider_id JOIN payment_categories c ON c.id = pr.category_id
     JOIN accounts a ON a.id = pay.from_account_id WHERE pay.id = ? AND pay.client_id = ?`, [id, clientId]);
  return rows[0];
}

export async function templates(clientId) {
  const { rows } = await query(
    `SELECT t.*, pr.name AS provider_name, pr.requisite_label FROM payment_templates t JOIN payment_providers pr ON pr.id = t.provider_id
     WHERE t.client_id = ? ORDER BY t.id`, [clientId]);
  return rows;
}

export async function template(id, clientId, db = { query }) {
  return (await db.query('SELECT * FROM payment_templates WHERE id = ? AND client_id = ?', [id, clientId])).rows[0];
}

export async function insertTemplate(db, t) {
  const { insertId } = await db.query(
    'INSERT INTO payment_templates (client_id, provider_id, from_account_id, name, requisite, amount) VALUES (?,?,?,?,?,?)',
    [t.clientId, t.providerId, t.fromAccountId, t.name, t.requisite, t.amount ?? null]);
  return (await db.query('SELECT * FROM payment_templates WHERE id = ?', [insertId])).rows[0];
}

export const deleteTemplate = (clientId, id) => query('DELETE FROM payment_templates WHERE id = ? AND client_id = ?', [id, clientId]);

export async function autopayments(clientId) {
  const { rows } = await query(
    `SELECT a.*, t.name AS template_name, pr.name AS provider_name FROM autopayments a JOIN payment_templates t ON t.id = a.template_id
     JOIN payment_providers pr ON pr.id = t.provider_id WHERE a.client_id = ? AND a.active ORDER BY a.id`, [clientId]);
  return rows;
}

export async function insertAutopayment(db, a) {
  const { insertId } = await db.query(
    'INSERT INTO autopayments (client_id, template_id, amount, day_of_month, next_date) VALUES (?,?,?,?,?)',
    [a.clientId, a.templateId, a.amount, a.day, a.nextDate]);
  return (await db.query('SELECT * FROM autopayments WHERE id = ?', [insertId])).rows[0];
}

export const cancelAutopayment = (clientId, id) => query('UPDATE autopayments SET active = false WHERE id = ? AND client_id = ?', [id, clientId]);

export async function dueAutopayments(db, date) {
  const { rows } = await db.query(
    `SELECT a.*, t.provider_id, t.from_account_id, t.requisite, c.user_id
     FROM autopayments a JOIN payment_templates t ON t.id = a.template_id JOIN clients c ON c.id = a.client_id
     WHERE a.active AND a.next_date <= ? ORDER BY a.id FOR UPDATE OF a`, [date]);
  return rows;
}

export async function saveAutopayment(db, id, fields) {
  const keys = Object.keys(fields);
  await db.query(`UPDATE autopayments SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}
