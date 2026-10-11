import { query } from '../db/pool.js';

/** @typedef {{id:number, login:string, password_hash:string, role_code:string, role_name:string, status:string, failed_attempts:number, locked_until:Date|null}} UserRow */

const SELECT_USER = `
  SELECT u.id, u.login, u.password_hash, u.status, u.failed_attempts, u.locked_until, u.totp_enabled, u.totp_secret_enc, u.totp_last_step, u.last_login_at,
         r.code AS role_code, r.name AS role_name,
         COALESCE(ARRAY(SELECT permission_code FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions
  FROM users u JOIN roles r ON r.id = u.role_id`;

/** @returns {Promise<UserRow | undefined>} */
export async function findByLogin(login) {
  const { rows } = await query(`${SELECT_USER} WHERE u.login = $1`, [login]);
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`${SELECT_USER} WHERE u.id = $1`, [id]);
  return rows[0];
}

/**
 * @param {import('pg').PoolClient | {query: Function}} db
 */
export async function create(db, { login, passwordHash, roleCode }) {
  const { rows } = await db.query(
    `INSERT INTO users (login, password_hash, role_id)
     VALUES ($1, $2, (SELECT id FROM roles WHERE code = $3)) RETURNING id`,
    [login, passwordHash, roleCode]
  );
  return rows[0].id;
}

export async function registerFailedLogin(id, maxAttempts, lockMinutes) {
  await query(
    `UPDATE users SET failed_attempts = failed_attempts + 1,
       locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
     WHERE id = $1`,
    [id, maxAttempts, lockMinutes]
  );
}

export async function registerSuccessfulLogin(id) {
  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [id]);
}

export async function setStatus(id, status) {
  await query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
}
