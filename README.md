# ТалерБанк

Система дистанционного банковского обслуживания физических лиц. Курсовой проект (БГУИР, «Проектирование и разработка web-приложений»).

Стек: Node.js 20+ (ES modules), Express 5, PostgreSQL 16, EJS, собственный CSS (одна таблица стилей), bcrypt, AES-256-GCM, Vitest и supertest.

## Быстрый запуск

1. Установите Node.js 20 или новее и PostgreSQL 16.
2. Создайте пользователя и базы (в psql под администратором):

   ```sql
   CREATE USER taler WITH PASSWORD 'taler' CREATEDB;
   CREATE DATABASE talerbank OWNER taler;
   CREATE DATABASE talerbank_test OWNER taler;
   ```

3. Для резервных копий нужны утилиты `pg_dump` и `pg_restore` (входят в PostgreSQL). Если их нет в PATH, задайте `PG_BIN_DIR` в `.env`.
4. Скопируйте `.env.example` в `.env` и задайте `SESSION_SECRET` и `DATA_KEY`.
5. Установите зависимости и создайте схему:

   ```
   npm install
   npm run db:migrate
   npm run db:seed
   npm start
   ```

6. Откройте http://localhost:3000. Пользователи для разработки (пароль `Taler2026`): сотрудники `admin`, `operator`, `credit`, `monitor` и клиенты `anna`, `igor` со счётом и деньгами. Чтобы увидеть начисление процентов и платежи по кредитам, войдите администратором и прокрутите дни на странице «Операционный день».

## Команды

| Команда | Что делает |
|---|---|
| `npm start` | запуск сервера |
| `npm run dev` | запуск с перезагрузкой при изменении файлов |
| `npm run db:migrate` | применяет SQL-файлы из `db/sql` |
| `npm run db:seed` | внутренние счета банка и служебные пользователи |
| `npm run db:schema` | собирает `db/schema.sql` (приложение к записке) |
| `npm test` | автотесты (используют базу `talerbank_test`, пересоздают её схему) |

## Структура

```
src/
  server.js        запуск
  app.js           сборка приложения Express
  config/          настройки из .env
  db/              пул соединений, транзакции, миграции, seed
  routes/          таблица маршрутов
  controllers/     тонкие обработчики HTTP
  services/        бизнес-логика: ledger, accounts, auth, kyc
  models/          SQL-запросы к таблицам
  middleware/      сессии, CSRF, права, ошибки
  lib/             деньги, IBAN, Луна, шифрование, проверки полей
  views/           шаблоны EJS
public/            единая таблица стилей css/style.css и картинки
db/sql/            схема БД и справочники (по порядку номеров)
test/              автотесты
docs/              концепция системы и описание модулей
```

Принципы архитектуры: `CLAUDE.md`, раздел «Архитектура кода». Концепция модулей: `docs/concept.md`.
