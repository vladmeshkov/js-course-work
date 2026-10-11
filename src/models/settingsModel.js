import { query } from '../db/pool.js';

export async function getNumber(key, db = { query }) {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (!rows[0]) throw new Error(`Нет настройки ${key}`);
  return Number(rows[0].value);
}

export async function set(key, value, db = { query }) {
  await db.query('UPDATE settings SET value = $2, updated_at = now() WHERE key = $1', [key, String(value)]);
}
