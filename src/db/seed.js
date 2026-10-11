import { pool, withTransaction } from './pool.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../services/authService.js';
import { ensureInternalAccount } from '../services/accountService.js';
import * as userModel from '../models/userModel.js';

/**
 * Создаёт внутренние счета банка и служебных пользователей для разработки.
 * Повторный запуск безопасен.
 */
const staff = [
  { login: 'admin', roleCode: 'admin' },
  { login: 'operator', roleCode: 'operator' },
  { login: 'credit', roleCode: 'credit_officer' },
  { login: 'monitor', roleCode: 'monitoring' }
];

await migrate();
await withTransaction(async (db) => {
  for (const currency of ['BYN', 'USD', 'EUR', 'RUB']) {
    for (const purpose of ['cash', 'income', 'expense', 'correspondent']) {
      await ensureInternalAccount(db, purpose, currency);
    }
  }
  const passwordHash = await hashPassword('Taler2026');
  for (const s of staff) {
    if (!(await userModel.findByLogin(s.login))) {
      await userModel.create(db, { login: s.login, passwordHash, roleCode: s.roleCode });
    }
  }
});
console.log('Готово. Служебные пользователи: admin, operator, credit, monitor, пароль Taler2026 (только для разработки)');
await pool.end();
