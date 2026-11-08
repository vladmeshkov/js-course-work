// Точка входа клиентского приложения ТалерБанка: подключает маршруты модулей и запускает маршрутизатор.
import { register, start } from './lib/router.js';
import core from './routes/core.js';
import accounts from './routes/accounts.js';
import payments from './routes/payments.js';
import products from './routes/products.js';
import staff from './routes/staff.js';
import admin from './routes/admin.js';

// порядок важен: первым совпавшим маршрутом считается самый ранний в списке
for (const routes of [core, accounts, payments, products, staff, admin]) register(routes);

start().catch((error) => {
  console.error(error);
  document.getElementById('content').textContent = 'Не удалось загрузить приложение. Обновите страницу.';
});
