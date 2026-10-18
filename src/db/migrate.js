import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { pool } from './pool.js';

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/sql');

/**
 * Применяет по порядку SQL-файлы из db/sql, которые ещё не применялись.
 * В MySQL команды определения схемы (DDL) не откатываются, поэтому файл помечается применённым только после успешного выполнения.
 * @returns {Promise<string[]>} имена применённых файлов
 */
export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    file_name VARCHAR(120) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  const done = new Set((await pool.query('SELECT file_name FROM schema_migrations')).rows.map((r) => r.file_name));
  const files = (await readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  // файл содержит несколько команд (в том числе триггеры), поэтому отдельное соединение с multipleStatements
  const connection = await mysql.createConnection({ uri: config.databaseUrl, multipleStatements: true, charset: 'utf8mb4' });
  try {
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(sqlDir, file), 'utf8');
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (file_name) VALUES (?)', [file]);
        applied.push(file);
      } catch (error) {
        throw new Error(`Ошибка в ${file}: ${error.message}`);
      }
    }
  } finally {
    await connection.end();
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const applied = await migrate();
  console.log(applied.length ? `Применено: ${applied.join(', ')}` : 'Схема актуальна');
  await pool.end();
}
