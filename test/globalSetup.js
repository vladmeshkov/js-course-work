import mysql from 'mysql2/promise';
import { testEnv } from './env.js';

// Перед запуском тестов пересоздаём тестовую базу и применяем все SQL-файлы.
export default async function setup() {
  Object.assign(process.env, testEnv);
  const url = new URL(testEnv.TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const connection = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true
  });
  await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.end();
  const { migrate } = await import('../src/db/migrate.js');
  const { pool: appPool } = await import('../src/db/pool.js');
  await migrate();
  // фиксированные курсы для тестов: API Нацбанка недоступен
  const { refreshRates } = await import('../src/services/ratesService.js');
  await refreshRates(() => Promise.reject(new Error('offline')));
  await appPool.query("UPDATE settings SET value = '0' WHERE `key` = 'security.require_2fa_staff'");
  await appPool.end();
}
