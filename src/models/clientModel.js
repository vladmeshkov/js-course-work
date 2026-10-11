import { query } from '../db/pool.js';

export async function create(db, c) {
  const { rows } = await db.query(
    `INSERT INTO clients (user_id, last_name, first_name, patronymic, birth_date, phone, email,
                          id_number_enc, id_number_hash, passport_enc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [c.userId, c.lastName, c.firstName, c.patronymic || null, c.birthDate, c.phone, c.email || null,
      c.idNumberEnc, c.idNumberHash, c.passportEnc]
  );
  return rows[0].id;
}

export async function findByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, last_name, first_name, patronymic, birth_date, phone, email, kyc_status, kyc_comment
     FROM clients WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}

export async function existsByIdHash(hash) {
  const { rowCount } = await query('SELECT 1 FROM clients WHERE id_number_hash = $1', [hash]);
  return rowCount > 0;
}

export async function setKycStatus(db, clientId, status, comment = null) {
  await db.query('UPDATE clients SET kyc_status = $2, kyc_comment = $3 WHERE id = $1', [clientId, status, comment]);
}

export async function listByKycStatus(status) {
  const { rows } = await query(
    `SELECT c.id, c.last_name, c.first_name, c.patronymic, c.birth_date, c.phone, c.created_at, u.login
     FROM clients c JOIN users u ON u.id = c.user_id WHERE c.kyc_status = $1 ORDER BY c.id`, [status]);
  return rows;
}

export async function findFull(id) {
  const { rows } = await query(
    `SELECT c.*, u.login FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [id]);
  return rows[0];
}
