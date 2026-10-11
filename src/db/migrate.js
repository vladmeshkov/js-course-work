import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/sql');

/**
 * Применяет по порядку SQL-файлы из db/sql, которые ещё не применялись.
 * @returns {Promise<string[]>} имена применённых файлов
 */
export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    file_name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await pool.query('SELECT file_name FROM schema_migrations')).rows.map((r) => r.file_name));
  const files = (await readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(sqlDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Ошибка в ${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const applied = await migrate();
  console.log(applied.length ? `Применено: ${applied.join(', ')}` : 'Схема актуальна');
  await pool.end();
}
