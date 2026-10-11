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

-- 004_transfers.sql
-- Переводы: заявки на перевод с подтверждением кодом

CREATE TABLE transfer_intents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          bigint NOT NULL REFERENCES users (id),
  kind             text NOT NULL CHECK (kind IN ('own', 'client')),
  from_account_id  bigint NOT NULL REFERENCES accounts (id),
  to_account_id    bigint NOT NULL REFERENCES accounts (id),
  amount           bigint NOT NULL CHECK (amount > 0),          -- в валюте счёта списания
  amount_byn       bigint NOT NULL CHECK (amount > 0),          -- эквивалент в BYN по курсу Нацбанка (для лимитов)
  fee              bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),  -- в валюте счёта списания
  comment          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled', 'expired')),
  document_id      bigint REFERENCES documents (id),
  bank_date        date,                                        -- дата проведения
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  CHECK (from_account_id <> to_account_id)
);
CREATE INDEX transfer_intents_user_idx ON transfer_intents (user_id, status);

-- 005_deposits.sql
-- Вклады: продукты и договоры

CREATE TABLE deposit_products (
  id                   smallserial PRIMARY KEY,
  name                 text NOT NULL,
  currency             char(3) NOT NULL REFERENCES currencies (code),
  term_months          smallint NOT NULL CHECK (term_months > 0),
  rate_percent         numeric(5, 2) NOT NULL CHECK (rate_percent > 0),
  demand_rate_percent  numeric(5, 2) NOT NULL DEFAULT 0.10 CHECK (demand_rate_percent >= 0),  -- ставка при досрочном расторжении
  min_amount           bigint NOT NULL CHECK (min_amount > 0),
  capitalization       boolean NOT NULL,   -- true: проценты прибавляются к вкладу, false: выплачиваются на текущий счёт
  revocable            boolean NOT NULL,   -- можно ли расторгнуть досрочно
  active               boolean NOT NULL DEFAULT true
);

CREATE TABLE deposits (
  id                 bigserial PRIMARY KEY,
  client_id          bigint NOT NULL REFERENCES clients (id),
  product_id         smallint NOT NULL REFERENCES deposit_products (id),
  account_id         bigint NOT NULL UNIQUE REFERENCES accounts (id),   -- счёт вклада
  payout_account_id  bigint NOT NULL REFERENCES accounts (id),          -- сюда возвращаются деньги и выплачиваются проценты
  currency           char(3) NOT NULL REFERENCES currencies (code),
  amount             bigint NOT NULL CHECK (amount > 0),                -- первоначальная сумма
  -- условия копируются из продукта, чтобы изменение продукта не меняло действующие договоры
  rate_percent       numeric(5, 2) NOT NULL,
  demand_rate_percent numeric(5, 2) NOT NULL,
  capitalization     boolean NOT NULL,
  revocable          boolean NOT NULL,
  opened_date        date NOT NULL,
  maturity_date      date NOT NULL,
  paid_until         date NOT NULL,      -- проценты начислены по эту дату (не включая)
  periods_done       integer NOT NULL DEFAULT 0,
  interest_total     bigint NOT NULL DEFAULT 0,   -- всего начислено процентов
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'early_closed')),
  closed_date        date,
  CHECK (maturity_date > opened_date)
);
CREATE INDEX deposits_client_idx ON deposits (client_id);

-- 006_loans.sql
-- Кредиты: продукты, заявки, договоры и графики платежей

CREATE TABLE loan_products (
  id            smallserial PRIMARY KEY,
  name          text NOT NULL,
  rate_percent  numeric(5, 2) NOT NULL CHECK (rate_percent > 0),
  min_amount    bigint NOT NULL CHECK (min_amount > 0),
  max_amount    bigint NOT NULL CHECK (max_amount >= min_amount),
  min_term      smallint NOT NULL CHECK (min_term > 0),
  max_term      smallint NOT NULL CHECK (max_term >= min_term),
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE loan_applications (
  id                  bigserial PRIMARY KEY,
  client_id           bigint NOT NULL REFERENCES clients (id),
  product_id          smallint NOT NULL REFERENCES loan_products (id),
  target_account_id   bigint NOT NULL REFERENCES accounts (id),   -- куда зачислить кредит и откуда списывать платежи
  amount              bigint NOT NULL CHECK (amount > 0),
  term_months         smallint NOT NULL CHECK (term_months > 0),
  schedule_type       text NOT NULL CHECK (schedule_type IN ('annuity', 'differentiated')),
  rate_percent        numeric(5, 2) NOT NULL,
  income              bigint NOT NULL CHECK (income > 0),         -- ежемесячный доход, копейки
  obligations         bigint NOT NULL DEFAULT 0 CHECK (obligations >= 0),  -- платежи по другим кредитам в месяц
  experience_months   integer NOT NULL CHECK (experience_months >= 0),
  dependents          smallint NOT NULL DEFAULT 0 CHECK (dependents >= 0),
  first_payment       bigint NOT NULL,                            -- ориентировочный первый платёж
  dti_percent         numeric(6, 2) NOT NULL,                     -- долговая нагрузка с учётом нового платежа
  score               smallint NOT NULL,
  scoring_notes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL CHECK (status IN ('manual_review', 'approved', 'rejected', 'signed')),
  decision_comment    text,
  decided_by          bigint REFERENCES users (id),
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loan_applications_status_idx ON loan_applications (status);
CREATE INDEX loan_applications_client_idx ON loan_applications (client_id);

CREATE TABLE loans (
  id                 bigserial PRIMARY KEY,
  application_id     bigint NOT NULL UNIQUE REFERENCES loan_applications (id),
  client_id          bigint NOT NULL REFERENCES clients (id),
  account_id         bigint NOT NULL UNIQUE REFERENCES accounts (id),   -- ссудный счёт
  payout_account_id  bigint NOT NULL REFERENCES accounts (id),          -- счёт, с которого списываются платежи
  amount             bigint NOT NULL CHECK (amount > 0),
  rate_percent       numeric(5, 2) NOT NULL,
  term_months        smallint NOT NULL,
  schedule_type      text NOT NULL CHECK (schedule_type IN ('annuity', 'differentiated')),
  opened_date        date NOT NULL,
  principal_balance  bigint NOT NULL CHECK (principal_balance >= 0),
  last_paid_date     date NOT NULL,       -- проценты уплачены по эту дату
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_date        date
);
CREATE INDEX loans_client_idx ON loans (client_id);

CREATE TABLE loan_schedule (
  id            bigserial PRIMARY KEY,
  loan_id       bigint NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  no            smallint NOT NULL,
  due_date      date NOT NULL,
  principal     bigint NOT NULL CHECK (principal >= 0),
  interest      bigint NOT NULL CHECK (interest >= 0),
  penalty       bigint NOT NULL DEFAULT 0 CHECK (penalty >= 0),
  penalty_from  date,                      -- с какой даты считается пеня за просрочку
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'overdue', 'paid', 'cancelled')),
  paid_date     date,
  UNIQUE (loan_id, no)
);
CREATE INDEX loan_schedule_due_idx ON loan_schedule (due_date) WHERE status IN ('planned', 'overdue');

-- 007_cards.sql
-- Виртуальные карты

CREATE TABLE cards (
  id             bigserial PRIMARY KEY,
  client_id      bigint NOT NULL REFERENCES clients (id),
  account_id     bigint NOT NULL REFERENCES accounts (id),
  system         text NOT NULL CHECK (system IN ('belkart', 'visa', 'mastercard')),
  number_enc     text NOT NULL,                 -- номер карты в зашифрованном виде
  number_hash    text NOT NULL UNIQUE,
  last4          char(4) NOT NULL,
  holder         text NOT NULL,
  expires        char(5) NOT NULL CHECK (expires ~ '^[0-9]{2}/[0-9]{2}$'),
  cvv_hash       text NOT NULL,                 -- CVV и PIN хранятся только как хэш
  pin_hash       text NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'closed')),
  per_op_limit   bigint NOT NULL DEFAULT 100000 CHECK (per_op_limit > 0),
  daily_limit    bigint NOT NULL DEFAULT 300000 CHECK (daily_limit >= per_op_limit),
  monthly_limit  bigint NOT NULL DEFAULT 1500000 CHECK (monthly_limit >= daily_limit),
  online_enabled boolean NOT NULL DEFAULT true,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  replaced_by    bigint REFERENCES cards (id)
);
CREATE INDEX cards_client_idx ON cards (client_id);
CREATE INDEX cards_account_idx ON cards (account_id);

-- Операции по картам (для лимитов)
CREATE TABLE card_operations (
  id           bigserial PRIMARY KEY,
  card_id      bigint NOT NULL REFERENCES cards (id),
  document_id  bigint NOT NULL REFERENCES documents (id),
  amount       bigint NOT NULL CHECK (amount > 0),
  online       boolean NOT NULL,
  place        text NOT NULL DEFAULT '',
  bank_date    date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_operations_card_idx ON card_operations (card_id, bank_date);

-- 008_payments.sql
-- Каталог платежей по образцу ЕРИП: категории, поставщики, платежи, шаблоны, автоплатежи

CREATE TABLE payment_categories (
  id    smallserial PRIMARY KEY,
  name  text NOT NULL,
  hint  text NOT NULL DEFAULT '',
  sort  smallint NOT NULL DEFAULT 0
);

CREATE TABLE payment_providers (
  id               serial PRIMARY KEY,
  category_id      smallint NOT NULL REFERENCES payment_categories (id),
  name             text NOT NULL,
  city             text,                         -- NULL: действует во всех городах
  requisite_label  text NOT NULL,                -- что вводит клиент: «Номер телефона», «Лицевой счёт»
  requisite_regex  text NOT NULL,                -- маска реквизита
  requisite_hint   text NOT NULL DEFAULT '',
  min_amount       bigint NOT NULL DEFAULT 100 CHECK (min_amount > 0),
  max_amount       bigint NOT NULL DEFAULT 500000 CHECK (max_amount >= min_amount),
  fee_percent      numeric(5, 2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0),
  active           boolean NOT NULL DEFAULT true
);
CREATE INDEX payment_providers_category_idx ON payment_providers (category_id);

CREATE TABLE payments (
  id               bigserial PRIMARY KEY,
  client_id        bigint NOT NULL REFERENCES clients (id),
  provider_id      integer NOT NULL REFERENCES payment_providers (id),
  from_account_id  bigint NOT NULL REFERENCES accounts (id),
  amount           bigint NOT NULL CHECK (amount > 0),
  fee              bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  requisite        text NOT NULL,
  document_id      bigint NOT NULL REFERENCES documents (id),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'autopay')),
  bank_date        date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_client_idx ON payments (client_id, id DESC);

CREATE TABLE payment_templates (
  id               bigserial PRIMARY KEY,
  client_id        bigint NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  provider_id      integer NOT NULL REFERENCES payment_providers (id),
  from_account_id  bigint NOT NULL REFERENCES accounts (id),
  name             text NOT NULL,
  requisite        text NOT NULL,
  amount           bigint CHECK (amount IS NULL OR amount > 0)
);
CREATE INDEX payment_templates_client_idx ON payment_templates (client_id);

CREATE TABLE autopayments (
  id             bigserial PRIMARY KEY,
  client_id      bigint NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  template_id    bigint NOT NULL REFERENCES payment_templates (id) ON DELETE CASCADE,
  amount         bigint NOT NULL CHECK (amount > 0),
  day_of_month   smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  next_date      date NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  fail_count     smallint NOT NULL DEFAULT 0,
  last_result    text NOT NULL DEFAULT ''
);
CREATE INDEX autopayments_due_idx ON autopayments (next_date) WHERE active;

-- 009_fraud.sql
-- Антифрод: случаи подозрительных операций и холды для задержанных переводов

ALTER TABLE transfer_intents DROP CONSTRAINT transfer_intents_status_check;
ALTER TABLE transfer_intents ADD CONSTRAINT transfer_intents_status_check
  CHECK (status IN ('new', 'review', 'confirmed', 'cancelled', 'expired', 'rejected'));

ALTER TABLE holds ADD COLUMN intent_id uuid REFERENCES transfer_intents (id);

CREATE TABLE fraud_cases (
  id               bigserial PRIMARY KEY,
  intent_id        uuid NOT NULL REFERENCES transfer_intents (id),
  user_id          bigint NOT NULL REFERENCES users (id),
  score            smallint NOT NULL,
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision         text NOT NULL CHECK (decision IN ('confirm', 'review', 'special')),
  status           text NOT NULL CHECK (status IN ('open', 'auto', 'approved', 'rejected')),
  special_control  boolean NOT NULL DEFAULT false,   -- операция особого контроля (Закон № 165-З)
  amount_byn       bigint NOT NULL,
  reviewed_by      bigint REFERENCES users (id),
  reviewed_at      timestamptz,
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_cases_status_idx ON fraud_cases (status, id);

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

-- 011_seed_deposits.sql
INSERT INTO deposit_products (name, currency, term_months, rate_percent, demand_rate_percent, min_amount, capitalization, revocable) VALUES
  ('Талер 6',          'BYN', 6,  9.80,  0.10, 10000, true,  true),
  ('Талер 12',         'BYN', 12, 11.50, 0.10, 10000, true,  true),
  ('Талер 24',         'BYN', 24, 12.20, 0.10, 50000, true,  false),
  ('Талер Доход',      'BYN', 12, 10.40, 0.10, 100000, false, true),
  ('Талер Валютный',   'USD', 12, 3.20,  0.05, 10000, true,  true);

-- 012_seed_loans.sql
INSERT INTO loan_products (name, rate_percent, min_amount, max_amount, min_term, max_term) VALUES
  ('Потребительский «Талер»', 14.90, 50000, 5000000, 6, 60),
  ('Потребительский «Быстрый»', 17.50, 50000, 500000, 3, 24);

INSERT INTO settings (key, value, description) VALUES
  ('loan.auto_limit',       '500000', 'Автоматическое одобрение возможно до этой суммы кредита, копейки'),
  ('loan.score_approve',    '70',     'Балл, с которого кредит одобряется автоматически'),
  ('loan.score_manual',     '45',     'Балл, с которого заявка идёт на ручное рассмотрение (ниже: отказ)');

-- 013_seed_payments.sql
INSERT INTO payment_categories (name, hint, sort) VALUES
  ('Жильё и коммунальные услуги', 'Квартплата, вода, свет, газ, отопление', 1),
  ('Связь', 'Мобильная связь', 2),
  ('Интернет и телевидение', 'Домашний интернет, цифровое ТВ', 3),
  ('Налоги и штрафы', 'Налоговая, ГАИ', 4),
  ('Образование', 'Детский сад, школа, университет', 5),
  ('Транспорт', 'Проездные, парковки', 6);

INSERT INTO payment_providers (category_id, name, city, requisite_label, requisite_regex, requisite_hint, min_amount, max_amount, fee_percent) VALUES
  (1, 'Горводоканал', 'Минск',   'Лицевой счёт', '^\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Энергосбыт', NULL,       'Лицевой счёт', '^\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Горгаз', 'Брест',        'Лицевой счёт', '^\d{9}$', '9 цифр с квитанции', 100, 200000, 0),
  (1, 'Теплосеть', 'Гомель',    'Лицевой счёт', '^\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Жилищно-эксплуатационный участок', 'Витебск', 'Лицевой счёт', '^\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (2, 'Мобильный оператор «Синий»', NULL, 'Номер телефона', '^\+375\d{9}$', 'В формате +375291234567', 100, 100000, 0),
  (2, 'Мобильный оператор «Зелёный»', NULL, 'Номер телефона', '^\+375\d{9}$', 'В формате +375331234567', 100, 100000, 0),
  (3, 'Интернет-провайдер «Сеть»', 'Минск', 'Номер договора', '^[A-Z0-9]{6,12}$', '6-12 символов из договора', 500, 200000, 0),
  (3, 'Цифровое телевидение', NULL, 'Номер договора', '^\d{7,10}$', '7-10 цифр', 500, 100000, 0.50),
  (4, 'Налоговая инспекция', NULL, 'Идентификационный номер', '^\d{7}[A-Z]\d{3}[A-Z]{2}\d$', 'Как в паспорте', 100, 5000000, 0),
  (4, 'ГАИ: штрафы', NULL, 'Номер постановления', '^\d{12,16}$', '12-16 цифр', 100, 1000000, 0),
  (5, 'Детский сад', 'Минск', 'Номер договора', '^\d{6,10}$', '6-10 цифр', 100, 100000, 0),
  (5, 'Университет', NULL, 'Номер договора', '^[A-Z0-9-]{6,14}$', 'Из договора на обучение', 1000, 2000000, 0),
  (6, 'Городской транспорт', 'Минск', 'Номер проездной карты', '^\d{10}$', '10 цифр на карте', 500, 50000, 0),
  (6, 'Парковки', NULL, 'Номер автомобиля', '^[A-Z0-9]{4,10}$', 'Например 1234AB7', 100, 100000, 0);

-- 014_seed_fraud.sql
INSERT INTO settings (key, value, description) VALUES
  ('fraud.large_amount',        '300000', 'Крупная сумма перевода в BYN, копейки (балл правила +40)'),
  ('fraud.new_recipient_amount','100000', 'Перевод новому получателю от этой суммы в BYN, копейки (+30)'),
  ('fraud.velocity_count',      '4',      'Число переводов за период, с которого срабатывает правило частоты (+30)'),
  ('fraud.velocity_minutes',    '10',     'Период правила частоты, минут'),
  ('fraud.new_client_amount',   '50000',  'Перевод от этой суммы в BYN в первые 3 дня после регистрации, копейки (+20)'),
  ('fraud.score_confirm',       '30',     'Балл риска, с которого требуется код подтверждения'),
  ('fraud.score_review',        '60',     'Балл риска, с которого перевод задерживается на проверку специалиста'),
  ('fraud.special_control',     '2000000','Порог операций особого контроля в BYN, копейки (Закон № 165-З)');

-- 015_reports_permission.sql
INSERT INTO permissions (code, description) VALUES ('reports.view', 'Отчёты банка');
INSERT INTO role_permissions (role_id, permission_code) SELECT id, 'reports.view' FROM roles WHERE code IN ('admin', 'credit_officer');

-- 016_security.sql
-- Двухфакторная аутентификация (TOTP) и уведомления

ALTER TABLE users ADD COLUMN totp_secret_enc text;
ALTER TABLE users ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_last_step bigint;     -- последний использованный временной интервал (защита от повторного ввода кода)
ALTER TABLE users ADD CONSTRAINT totp_secret_required CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

CREATE TABLE recovery_codes (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  UNIQUE (user_id, code_hash)
);

CREATE TABLE notifications (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text NOT NULL,                    -- вид события: transfer, loan, deposit, card, security ...
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- напоминание о платеже по кредиту отправляется один раз
ALTER TABLE loan_schedule ADD COLUMN reminded boolean NOT NULL DEFAULT false;
