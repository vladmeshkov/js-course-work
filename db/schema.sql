-- ТалерБанк: полный скрипт создания базы данных (PostgreSQL 16)
-- Файл собирается командой npm run db:schema из db/sql/*.sql

-- 001_auth.sql
-- Роли, права и пользователи

CREATE TABLE roles (
  id          smallserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL
);

CREATE TABLE permissions (
  code        text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id         smallint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE users (
  id               bigserial PRIMARY KEY,
  login            text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9._-]{3,32}$'),
  password_hash    text NOT NULL,
  role_id          smallint NOT NULL REFERENCES roles (id),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  failed_attempts  integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Анкета клиента. Паспорт и идентификационный номер хранятся в зашифрованном виде (AES-256-GCM).
CREATE TABLE clients (
  id               bigserial PRIMARY KEY,
  user_id          bigint NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  last_name        text NOT NULL,
  first_name       text NOT NULL,
  patronymic       text,
  birth_date       date NOT NULL,
  phone            text NOT NULL CHECK (phone ~ '^\+375[0-9]{9}$'),
  email            text,
  id_number_enc    text NOT NULL,
  id_number_hash   text NOT NULL UNIQUE,
  passport_enc     text NOT NULL,
  kyc_status       text NOT NULL DEFAULT 'submitted'
                   CHECK (kyc_status IN ('submitted', 'in_review', 'verified', 'rejected')),
  kyc_comment      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Журнал аудита: только дописывается (запрет UPDATE и DELETE ниже).
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     bigint REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  result      text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  ip          text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);

CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Таблица % допускает только добавление записей', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Одноразовые коды подтверждения операций (OTP)
CREATE TABLE otp_codes (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id, purpose);

-- Таблица сессий для connect-pg-simple
CREATE TABLE session (
  sid     varchar NOT NULL PRIMARY KEY,
  sess    json NOT NULL,
  expire  timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);

-- 002_ledger.sql
-- Учёт денег: валюты, счета, документы и проводки (двойная запись)

CREATE TABLE currencies (
  code         char(3) PRIMARY KEY,
  numeric_code char(3) NOT NULL UNIQUE,
  name         text NOT NULL
);

-- Банковская дата. Одна строка. Меняется при закрытии операционного дня.
CREATE TABLE bank_state (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  bank_date   date NOT NULL
);

CREATE SEQUENCE account_number_seq START 1;

-- Счета клиентов и внутренние счета банка (owner_client_id IS NULL).
-- balance хранится в копейках и является кэшем: он обновляется в той же транзакции, что и проводки.
CREATE TABLE accounts (
  id               bigserial PRIMARY KEY,
  iban             char(28) NOT NULL UNIQUE CHECK (iban ~ '^BY[0-9]{2}[A-Z0-9]{24}$'),
  owner_client_id  bigint REFERENCES clients (id) ON DELETE RESTRICT,
  balance_code     char(4) NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('current', 'savings', 'deposit', 'loan', 'internal')),
  title            text NOT NULL,
  -- назначение внутреннего счёта: cash, income, expense и т. д. (для клиентских счетов NULL)
  purpose          text,
  currency         char(3) NOT NULL REFERENCES currencies (code),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'frozen', 'closed')),
  balance          bigint NOT NULL DEFAULT 0,
  min_balance      bigint NOT NULL DEFAULT 0 CHECK (min_balance >= 0),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  -- у клиентских счетов должен быть владелец, у внутренних его нет
  CHECK ((kind = 'internal') = (owner_client_id IS NULL)),
  -- клиентский счёт нельзя уводить в минус (внутренние и ссудные счета могут иметь любой знак)
  CHECK (kind IN ('internal', 'loan') OR balance >= 0)
);
CREATE INDEX accounts_owner_idx ON accounts (owner_client_id);
CREATE UNIQUE INDEX accounts_purpose_idx ON accounts (purpose, currency) WHERE purpose IS NOT NULL;

-- Документ: одна бизнес-операция. Содержит набор проводок.
CREATE TABLE documents (
  id                bigserial PRIMARY KEY,
  type              text NOT NULL,
  status            text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'reversed')),
  idempotency_key   text UNIQUE,
  initiated_by      bigint REFERENCES users (id) ON DELETE SET NULL,
  bank_date         date NOT NULL,
  description       text NOT NULL DEFAULT '',
  reverses_id       bigint REFERENCES documents (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Проводка: Дт счёт, Кт счёт, сумма в копейках. Не изменяется и не удаляется, ошибки исправляет сторно.
CREATE TABLE postings (
  id                 bigserial PRIMARY KEY,
  document_id        bigint NOT NULL REFERENCES documents (id) ON DELETE RESTRICT,
  debit_account_id   bigint NOT NULL REFERENCES accounts (id),
  credit_account_id  bigint NOT NULL REFERENCES accounts (id),
  amount             bigint NOT NULL CHECK (amount > 0),
  currency           char(3) NOT NULL REFERENCES currencies (code),
  bank_date          date NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account_id <> credit_account_id)
);
CREATE INDEX postings_document_idx ON postings (document_id);
CREATE INDEX postings_debit_idx ON postings (debit_account_id, bank_date);
CREATE INDEX postings_credit_idx ON postings (credit_account_id, bank_date);

CREATE TRIGGER postings_append_only
  BEFORE UPDATE OR DELETE ON postings
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Проводка допустима, только если оба счёта в валюте проводки (конвертация идёт через счета банка)
CREATE FUNCTION check_posting_currency() RETURNS trigger AS $$
DECLARE
  debit_currency char(3);
  credit_currency char(3);
BEGIN
  SELECT currency INTO debit_currency FROM accounts WHERE id = NEW.debit_account_id;
  SELECT currency INTO credit_currency FROM accounts WHERE id = NEW.credit_account_id;
  IF debit_currency <> NEW.currency OR credit_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Валюта проводки не совпадает с валютой счетов';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER postings_currency
  BEFORE INSERT ON postings
  FOR EACH ROW EXECUTE FUNCTION check_posting_currency();

-- Холды: суммы, зарезервированные на счёте до окончательного проведения
CREATE TABLE holds (
  id           bigserial PRIMARY KEY,
  account_id   bigint NOT NULL REFERENCES accounts (id),
  amount       bigint NOT NULL CHECK (amount > 0),
  document_id  bigint REFERENCES documents (id),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'captured')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);
CREATE INDEX holds_account_idx ON holds (account_id) WHERE status = 'active';

-- 003_reference.sql
-- Справочники: курсы, тарифы и лимиты

-- Курс Нацбанка. rate: сколько BYN за scale единиц валюты.
CREATE TABLE exchange_rates (
  id          bigserial PRIMARY KEY,
  currency    char(3) NOT NULL REFERENCES currencies (code),
  rate_date   date NOT NULL,
  rate        numeric(14, 4) NOT NULL CHECK (rate > 0),
  scale       integer NOT NULL DEFAULT 1 CHECK (scale > 0),
  UNIQUE (currency, rate_date)
);

-- Спред банка к курсу Нацбанка, в процентах. Задаёт администратор.
CREATE TABLE rate_spreads (
  currency        char(3) PRIMARY KEY REFERENCES currencies (code),
  buy_percent     numeric(5, 2) NOT NULL DEFAULT 1.50 CHECK (buy_percent >= 0),
  sell_percent    numeric(5, 2) NOT NULL DEFAULT 1.50 CHECK (sell_percent >= 0)
);

-- Тарифы и лимиты: пары «код, значение», изменяются в админке
CREATE TABLE settings (
  key          text PRIMARY KEY,
  value        text NOT NULL,
  description  text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 010_seed_reference.sql
-- Начальные данные: роли, права, валюты, настройки

INSERT INTO roles (code, name) VALUES
  ('client',        'Клиент'),
  ('operator',      'Операционист'),
  ('credit_officer','Кредитный специалист'),
  ('monitoring',    'Специалист по финансовому мониторингу'),
  ('admin',         'Администратор');

INSERT INTO permissions (code, description) VALUES
  ('own.accounts',     'Работа со своими счетами и картами'),
  ('own.transfers',    'Переводы и платежи со своих счетов'),
  ('own.deposits',     'Вклады клиента'),
  ('own.loans',        'Кредиты клиента'),
  ('kyc.review',       'Проверка заявок на подключение'),
  ('cash.operate',     'Взнос и выдача наличных'),
  ('account.freeze',   'Арест и блокировка счетов'),
  ('loan.review',      'Рассмотрение кредитных заявок'),
  ('fraud.review',     'Очередь антифрода'),
  ('rates.manage',     'Курсы и тарифы'),
  ('users.manage',     'Пользователи и роли'),
  ('audit.view',       'Журнал аудита'),
  ('eod.run',          'Закрытие операционного дня'),
  ('backup.manage',    'Резервное копирование');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r JOIN permissions p ON
  (r.code = 'client'         AND p.code IN ('own.accounts', 'own.transfers', 'own.deposits', 'own.loans'))
  OR (r.code = 'operator'    AND p.code IN ('kyc.review', 'cash.operate', 'account.freeze'))
  OR (r.code = 'credit_officer' AND p.code IN ('loan.review'))
  OR (r.code = 'monitoring'  AND p.code IN ('fraud.review'))
  OR (r.code = 'admin'       AND p.code IN ('rates.manage', 'users.manage', 'audit.view', 'eod.run', 'backup.manage'));

INSERT INTO currencies (code, numeric_code, name) VALUES
  ('BYN', '933', 'Белорусский рубль'),
  ('USD', '840', 'Доллар США'),
  ('EUR', '978', 'Евро'),
  ('RUB', '643', 'Российский рубль');

INSERT INTO rate_spreads (currency) VALUES ('USD'), ('EUR'), ('RUB');

INSERT INTO settings (key, value, description) VALUES
  ('transfer.daily_limit',       '500000', 'Суточный лимит переводов клиента, в копейках BYN'),
  ('transfer.otp_threshold',     '10000',  'Сумма перевода, с которой нужен код подтверждения, в копейках BYN'),
  ('transfer.fee_percent',       '0',      'Комиссия за перевод внутри банка, %'),
  ('loan.max_dti_percent',       '40',     'Максимальная долговая нагрузка, %'),
  ('loan.penalty_percent_day',   '0.1',    'Пеня за день просрочки, %');

INSERT INTO bank_state (bank_date) VALUES (CURRENT_DATE);
