# Клиент и API: как устроен интерфейс

Серверных шаблонов нет. Сервер отдаёт JSON (`/api/...`) и статические файлы, интерфейс собирается в браузере из модулей JavaScript.

```
Браузер                                         Сервер (Express 5)
public/index.html  ── статика ──────────────►   express.static + запасной index.html
public/js/app.js   ── fetch /api/... ───────►   routes → controllers → services → models → MySQL
```

* `public/index.html` – оболочка: шапка (`#site-header`), `main#content`, подвал.
* `public/css/style.css` – единственная таблица стилей. Встроенные стили (`style="..."`, `<style>`) запрещены политикой CSP и проверяются тестом. Ширины и подобное задаются классами или через `element.style.setProperty` в коде.
* `public/js/lib/` – общие модули: `html.js` (шаблоны), `api.js` (запросы), `router.js` (маршрутизатор), `ui.js` (формы, сообщения), `format.js` (деньги и даты), `layout.js` (шапка и поиск), `motion.js` (анимации), `flags.js`, `rates-block.js`.
* `public/js/routes/<модуль>.js` – таблица маршрутов модуля. `public/js/pages/*.js` – страницы.

## Модуль страницы

```js
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

export default async function page(ctx) {   // ctx: { params, query, session, navigate, refreshSession }
  const data = await api.get('/accounts');   // GET /api/accounts
  return {
    title: 'Счета',                          // в заголовок вкладки: «Счета · ТалерБанк»
    body: html`<h1>Счета</h1> ... ${data.items.map((a) => html`<a href="/accounts/${a.id}">${a.title}</a>`)}`,
    mount(root) { /* обработчики событий после вставки разметки */ },
    cleanup() { /* необязательно: снять таймеры */ }
  };
}
```

* `html` экранирует всё, что подставляется через `${}`. Вложенный `html\`...\`` не экранируется повторно, массивы склеиваются, `null`, `undefined` и `false` дают пустую строку. Атрибуты тоже экранируются, их можно писать в `"..."`. Для доверенной разметки (SVG QR-кода от сервера) есть `raw()`.
* Вместо `redirect` в разметке вернуть `{ redirect: '/путь' }`: маршрутизатор перейдёт без записи в историю.
* Ошибки API (`ApiError`) в `page()` обрабатывает маршрутизатор: 401 ведёт на вход (после входа вернёт на эту страницу), `staff_2fa_required` на настройку 2FA, остальные рисуются как страница ошибки. Ошибку, которую страница ждёт, ловите сами (`try { ... } catch (e) { if (e.code === ...) }`).
* Ссылки `<a href="/...">` перехватываются маршрутизатором (переход без перезагрузки). Ссылки на файлы (PDF, CSV) и на `/api/...` открываются обычным образом: для них маршрутизатор ничего не делает, а `download`/`target` не нужны (скачивание задаёт заголовок ответа). Если ссылка на внутренний адрес должна загрузиться как обычная страница, добавьте `data-native`.
* Маршрут описывается в `public/js/routes/<модуль>.js`:

```js
export default [
  { path: '/accounts', load: () => import('../pages/accounts.js'), access: 'client' },
  { path: '/accounts/new', load: () => import('../pages/account-new.js'), access: 'client' },   // статичные пути раньше «:id»
  { path: '/accounts/:id', load: () => import('../pages/account.js'), access: 'client' }
];
```

`access`: `'public'` (по умолчанию), `'auth'` (любой вошедший), `'client'`, `'staff'` или `{ permission: 'код.права' }`. Это только удобство интерфейса, права проверяет сервер.

## Формы

```js
import { bindForm, errorSlot, formError } from '../lib/ui.js';
// в разметке:  <form id="f"> ... <div class="field"><label for="amount">Сумма</label><input id="amount" name="amount">${errorSlot('amount')}</div> ${formError()} <button class="btn" type="submit">Отправить</button></form>
bindForm(root.querySelector('#f'), async (data, form) => {
  const result = await api.post('/transfers', data);   // data: { имяПоля: значение }, флажок: 'on' если отмечен
  await navigate(`/transfers/${result.id}/confirm`);
});
```

`bindForm` блокирует повторную отправку, показывает ошибки полей из ответа `422` (`error.fields`: `{ amount: 'Введите сумму' }`) в `errorSlot(имя)` и общую ошибку в `formError()`. Если слота нет, сообщение выводится сверху страницы. Форма из одних кнопок (закрыть счёт, отменить) тоже подключается через `bindForm`. Сообщение «Готово», которое нужно показать на следующей странице: `flash('success', 'Перевод выполнен')` перед `navigate(...)`. Сообщение на текущей странице: `showAlert(root, 'success', '...')`.

Токен CSRF и cookie сессии `api.js` подставляет сам. После действий, меняющих сессию или счётчики шапки (вход, выход, прочтение уведомлений, включение 2FA), вызвать `await ctx.refreshSession()`.

## API

* Базовый адрес `/api`. Пути повторяют адреса страниц: страница `/accounts/5` загружает `GET /api/accounts/5`.
* Успех: `200`/`201` и JSON с данными страницы. Ничего не «рендерится»: контроллер отдаёт то, что раньше передавалось в шаблон (`res.json(...)`).
* Ошибка: `{ "error": { "message": "...", "code": "...", "fields": { "поле": "..." } } }`. Коды: `validation` (422, есть `fields`), `business_rule` (409), `unauthorized` (401), `forbidden` (403), `not_found` (404), `csrf` (403), `staff_2fa_required` (403).
* Контроллеры тонкие: `AppError`, `ValidationError`, `BusinessError` из сервисов не перехватываются, их превращает в JSON `src/middleware/errorHandler.js`. Не нужно ловить ошибку и «рендерить форму с ошибками».
* Редиректы сервера заменены данными: контроллер возвращает то, что нужно клиенту для перехода (например `{ id, review: false }`), а переход делает страница.
* Права проверяют `requireAuth`, `requireClient`, `requireStaff`, `requirePermission(код)` из `src/middleware/auth.js`.
* Файлы (PDF, CSV) – обычные `GET` с `Content-Disposition`; ссылка на них ведёт на `/api/...`.
* Сессия: `GET /api/session` → `{ csrfToken, user, nav, unread }`. Сообщения «flash» в сессии сервера больше нет, сообщение для следующей страницы клиент хранит в `sessionStorage` (`flash()` из `ui.js`).
* Код подтверждения в учебном режиме (без почты) приходит в JSON-ответе (поле `demoCode`), страница показывает его на экране подтверждения.

## Тесты

`test/http.js`: `apiClient(app)` и `loggedIn(app, login, пароль)` держат cookie и токен CSRF: `client.get('/accounts')`, `client.post('/transfers', {...})` (без префикса `/api`). Пример: `test/app.test.js`.
