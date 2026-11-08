// Точка входа клиентского приложения ТалерБанка: подключает маршруты модулей и запускает маршрутизатор.
import { register, start } from './lib/router.js';
import routes from './routes.js';

register(routes);

start().catch((error) => {
  console.error(error);
  document.getElementById('content').textContent = 'Не удалось загрузить приложение. Обновите страницу.';
});
