import { query } from '../db/pool.js';

export async function create(db, c) {
  const { insertId } = await db.query(
    `INSERT INTO clients (user_id, last_name, first_name, patronymic, birth_date, phone, email,
                          id_number_enc, id_number_hash, passport_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.userId, c.lastName, c.firstName, c.patronymic || null, c.birthDate, c.phone, c.email || null,
      c.idNumberEnc, c.idNumberHash, c.passportEnc]
  );
  return insertId;
}

export async function findByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, last_name, first_name, patronymic, birth_date, phone, email, kyc_status, kyc_comment
     FROM clients WHERE user_id = ?`,
    [userId]
  );
  return rows[0];
}

export async function existsByIdHash(hash) {
  const { rowCount } = await query('SELECT 1 FROM clients WHERE id_number_hash = ?', [hash]);
  return rowCount > 0;
}

export async function setKycStatus(db, clientId, status, comment = null) {
  await db.query('UPDATE clients SET kyc_status = ?, kyc_comment = ? WHERE id = ?', [status, comment, clientId]);
}

export async function listByKycStatus(status) {
  const { rows } = await query(
    `SELECT c.id, c.last_name, c.first_name, c.patronymic, c.birth_date, c.phone, c.created_at, u.login
     FROM clients c JOIN users u ON u.id = c.user_id WHERE c.kyc_status = ? ORDER BY c.id`, [status]);
  return rows;
}

export async function findFull(id) {
  const { rows } = await query(
    `SELECT c.*, u.login FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [id]);
  return rows[0];
}
