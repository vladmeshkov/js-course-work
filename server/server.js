import { createApp } from './app.js';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { scheduleBackups } from './modules/admin/backup.service.js';
import { scheduleOutbox } from './modules/notifications/mail.service.js';

/** Подсказки для частых ошибок подключения к MySQL. */
const DB_HINTS = {
  ER_ACCESS_DENIED_ERROR: 'MySQL не принимает логин или пароль из DATABASE_URL в .env. Создайте пользователя (docs/install.md, раздел 3) или поправьте пароль в .env.',
  ER_BAD_DB_ERROR: 'База из DATABASE_URL не создана. Выполните CREATE DATABASE из docs/install.md, раздел 3.',
  ECONNREFUSED: 'MySQL не запущен или слушает другой порт. Запустите службу MySQL (MySQL80 в «Службах» Windows).',
  ER_NO_SUCH_TABLE: 'Таблицы не созданы. Выполните npm run db:migrate и npm run db:seed.'
};

async function checkDatabase() {
  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
  } catch (error) {
    const url = config.databaseUrl.replace(/:[^:@/]*@/, ':***@');
    console.error(`Не удалось подключиться к базе ${url}`);
    console.error(`${error.code ?? ''} ${error.message}`.trim());
    if (DB_HINTS[error.code]) console.error(DB_HINTS[error.code]);
    process.exit(1);
  }
}

await checkDatabase();
createApp().listen(config.port, () => {
  console.log(`ТалерБанк запущен: http://localhost:${config.port}`);
  if (scheduleOutbox()) console.log('Почта: уведомления и коды отправляются на email клиентов');
  else console.log('Почта не настроена (SMTP_HOST): коды подтверждения показываются на странице');
  if (scheduleBackups()) console.log(`Резервное копирование каждые ${config.backup.intervalHours} ч`);
});
