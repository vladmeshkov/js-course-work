import pg from 'pg';
import { config } from '../config/index.js';

// Суммы хранятся в копейках (BIGINT) и помещаются в безопасный диапазон Number.
pg.types.setTypeParser(20, (value) => Number(value));
// DATE возвращаем строкой 'ГГГГ-ММ-ДД', чтобы не зависеть от часового пояса.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Выполняет запрос вне транзакции.
 * @param {string} text
 * @param {any[]} [params]
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Выполняет функцию в одной транзакции. При исключении транзакция откатывается.
 * Каждая денежная операция должна выполняться через эту функцию.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
