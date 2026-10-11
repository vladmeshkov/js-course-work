import pg from 'pg';
import { testEnv } from './env.js';

// Перед запуском тестов пересоздаём схему тестовой базы и применяем все SQL-файлы.
export default async function setup() {
  Object.assign(process.env, testEnv);
  const pool = new pg.Pool({ connectionString: testEnv.TEST_DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  const { migrate } = await import('../src/db/migrate.js');
  const { pool: appPool } = await import('../src/db/pool.js');
  await migrate();
  // фиксированные курсы для тестов: API Нацбанка недоступен
  const { refreshRates } = await import('../src/services/ratesService.js');
  await refreshRates(() => Promise.reject(new Error('offline')));
  await appPool.end();
}
