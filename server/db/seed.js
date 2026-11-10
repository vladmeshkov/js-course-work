import { pool, withTransaction } from './pool.js';
import { config } from '../config/index.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { ensureInternalAccount } from '../modules/accounts/account.service.js';
import * as userModel from '../modules/auth/user.model.js';
import { register } from '../modules/auth/auth.service.js';
import { verifyClient } from '../modules/clients/kyc.service.js';
import { post } from '../modules/ledger/ledger.service.js';

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

import { refreshRates } from '../modules/rates/rates.service.js';
import { ensureModel } from '../modules/loans/scoring.service.js';

// демонстрационные пользователи с общим паролем недопустимы на рабочем сервере
if (config.isProd) {
  console.error('db:seed создаёт демонстрационных пользователей с паролем Taler2026 и не запускается при NODE_ENV=production');
  process.exit(1);
}

await migrate();
await withTransaction(async (db) => {
  for (const currency of ['BYN', 'USD', 'EUR', 'RUB', 'CNY']) {
    for (const purpose of ['cash', 'income', 'expense', 'correspondent', 'conversion']) {
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
// демо-клиенты для разработки и показа: анкета, проверка, счёт и взнос наличных
const demo = [
  { login: 'anna', lastName: 'Иванова', firstName: 'Анна', patronymic: 'Сергеевна', idNumber: '3010590A001PB4', passport: 'MC1234567', phone: '+375291112233', birth: '1995-04-12', cash: 520000 },
  { login: 'igor', lastName: 'Петров', firstName: 'Игорь', patronymic: 'Олегович', idNumber: '3020488B002PB1', passport: 'MC7654321', phone: '+375297778899', birth: '1988-11-03', cash: 150000 }
];
const operator = await userModel.findByLogin('operator');
for (const d of demo) {
  if (await userModel.findByLogin(d.login)) continue;
  const { clientId } = await register({
    login: d.login, password: 'Taler2026', passwordRepeat: 'Taler2026', lastName: d.lastName, firstName: d.firstName, patronymic: d.patronymic,
    idNumber: d.idNumber, passport: d.passport, phone: d.phone, birthDate: d.birth
  });
  const account = await verifyClient(clientId, operator.id);
  await withTransaction(async (db) => {
    const cash = await ensureInternalAccount(db, 'cash', 'BYN');
    await post({ type: 'cash_in', description: 'Взнос наличных', entries: [{ debit: cash.id, credit: account.id, amount: d.cash, currency: 'BYN' }] }, db);
  });
}
const trained = await ensureModel();
if (trained) console.log(`Скоринг: обучена модель версии ${trained.version}, AUC ${trained.metrics.auc.toFixed(3)}`);
const source = await refreshRates();
console.log(`Курсы валют: ${source}`);
console.log('Готово. Пользователи (пароль Taler2026, только для разработки): admin, operator, credit, monitor, клиенты anna и igor');
await pool.end();
