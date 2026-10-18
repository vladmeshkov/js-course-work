import { query } from '../db/pool.js';

export async function insert(db, e) {
  await (db ?? { query }).query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, result, ip, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [e.userId ?? null, e.action, e.entity ?? null, e.entityId == null ? null : String(e.entityId),
      e.result ?? 'success', e.ip ?? null, JSON.stringify(e.details ?? {})]
  );
}

export async function latest(limit = 100) {
  const { rows } = await query(
    `SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.result, a.ip, u.login
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`,
    [limit]
  );
  return rows;
}
