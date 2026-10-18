// Включает или выключает обязательную 2FA для сотрудников: npm run staff2fa:off или npm run staff2fa:on
import { pool } from '../src/db/pool.js';

const mode = process.argv[2];
if (!['on', 'off'].includes(mode)) {
  console.log('Использование: npm run staff2fa:off  или  npm run staff2fa:on');
} else {
  await pool.query("UPDATE settings SET value = ? WHERE `key` = 'security.require_2fa_staff'", [mode === 'on' ? '1' : '0']);
  console.log(mode === 'on' ? 'Обязательная 2FA для сотрудников включена.' : 'Обязательная 2FA для сотрудников выключена: сотрудники входят по одному паролю.');
}
await pool.end();
