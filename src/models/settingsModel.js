import { query } from '../db/pool.js';

export async function getNumber(key, db = { query }) {
  const { rows } = await db.query('SELECT value FROM settings WHERE `key` = ?', [key]);
  if (!rows[0]) throw new Error(`Нет настройки ${key}`);
  return Number(rows[0].value);
}

export async function set(key, value, db = { query }) {
  await db.query('UPDATE settings SET value = ?, updated_at = UTC_TIMESTAMP(3) WHERE `key` = ?', [String(value), key]);
}
