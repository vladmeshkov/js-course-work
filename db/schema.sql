-- ТалерБанк: полный скрипт создания базы данных (MySQL 8)
-- Файл собирается командой npm run db:schema из db/sql/*.sql
-- Перед выполнением: CREATE DATABASE talerbank CHARACTER SET utf8mb4; USE talerbank;

-- 001_auth.sql
-- Роли, права и пользователи (MySQL 8)

CREATE TABLE roles (
  id    SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(30) NOT NULL UNIQUE,
  name  VARCHAR(100) NOT NULL
);

CREATE TABLE permissions (
  code         VARCHAR(40) NOT NULL PRIMARY KEY,
  description  VARCHAR(200) NOT NULL
);

CREATE TABLE role_permissions (
  role_id          SMALLINT NOT NULL,
  permission_code  VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES permissions (code) ON DELETE CASCADE
);

CREATE TABLE users (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  login            VARCHAR(32) NOT NULL UNIQUE,
  password_hash    VARCHAR(100) NOT NULL,
  role_id          SMALLINT NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     DATETIME(3) NULL,
  last_login_at    DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT users_login_check CHECK (REGEXP_LIKE(login, '^[a-z0-9._-]{3,32}$', 'c')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'blocked')),
  CONSTRAINT users_attempts_check CHECK (failed_attempts >= 0)
);

-- Анкета клиента. Паспорт и идентификационный номер хранятся в зашифрованном виде (AES-256-GCM).
CREATE TABLE clients (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT NOT NULL UNIQUE,
  last_name        VARCHAR(100) NOT NULL,
  first_name       VARCHAR(100) NOT NULL,
  patronymic       VARCHAR(100) NULL,
  birth_date       DATE NOT NULL,
  phone            VARCHAR(13) NOT NULL,
  email            VARCHAR(254) NULL,
  id_number_enc    TEXT NOT NULL,
  id_number_hash   VARCHAR(64) NOT NULL UNIQUE,
  passport_enc     TEXT NOT NULL,
  kyc_status       VARCHAR(12) NOT NULL DEFAULT 'submitted',
  kyc_comment      TEXT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT clients_phone_check CHECK (REGEXP_LIKE(phone, '^\\+375[0-9]{9}$')),
  CONSTRAINT clients_kyc_check CHECK (kyc_status IN ('submitted', 'in_review', 'verified', 'rejected'))
);

-- Журнал аудита: только дописывается (запрет UPDATE и DELETE ниже).
CREATE TABLE audit_log (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id     BIGINT NULL,
  action      VARCHAR(60) NOT NULL,
  entity      VARCHAR(60) NULL,
  entity_id   VARCHAR(60) NULL,
  result      VARCHAR(10) NOT NULL DEFAULT 'success',
  ip          VARCHAR(64) NULL,
  details     JSON NOT NULL DEFAULT (JSON_OBJECT()),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT audit_log_result_check CHECK (result IN ('success', 'failure'))
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);

DELIMITER $$
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица audit_log допускает только добавление записей';
END$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица audit_log допускает только добавление записей';
END$$
DELIMITER ;

-- Одноразовые коды подтверждения операций (OTP)
CREATE TABLE otp_codes (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  purpose     VARCHAR(80) NOT NULL,
  code_hash   VARCHAR(100) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME(3) NOT NULL,
  used_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id, purpose);

-- Сессии пользователей (хранилище express-session)
CREATE TABLE sessions (
  sid         VARCHAR(128) NOT NULL PRIMARY KEY,
  sess        JSON NOT NULL,
  expires_at  DATETIME(3) NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- 002_ledger.sql
-- Учёт денег: валюты, счета, документы и проводки (двойная запись)

CREATE TABLE currencies (
  code          CHAR(3) NOT NULL PRIMARY KEY,
  numeric_code  CHAR(3) NOT NULL UNIQUE,
  name          VARCHAR(60) NOT NULL
);

-- Банковская дата. Одна строка. Меняется при закрытии операционного дня.
CREATE TABLE bank_state (
  id         TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  bank_date  DATE NOT NULL,
  CONSTRAINT bank_state_single CHECK (id = 1)
);

-- Источник последовательных номеров счетов (номер берётся из AUTO_INCREMENT)
CREATE TABLE account_number_seq (
  n BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
);

-- Счета клиентов и внутренние счета банка (owner_client_id IS NULL).
-- balance хранится в копейках и является кэшем: он обновляется в той же транзакции, что и проводки.
CREATE TABLE accounts (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iban             CHAR(28) NOT NULL UNIQUE,
  owner_client_id  BIGINT NULL,
  balance_code     CHAR(4) NOT NULL,
  kind             VARCHAR(10) NOT NULL,
  title            VARCHAR(120) NOT NULL,
  -- назначение внутреннего счёта: cash, income, expense и т. д. (для клиентских счетов NULL)
  purpose          VARCHAR(30) NULL,
  currency         CHAR(3) NOT NULL,
  status           VARCHAR(8) NOT NULL DEFAULT 'open',
  balance          BIGINT NOT NULL DEFAULT 0,
  min_balance      BIGINT NOT NULL DEFAULT 0,
  opened_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at        DATETIME(3) NULL,
  FOREIGN KEY (owner_client_id) REFERENCES clients (id) ON DELETE RESTRICT,
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT accounts_iban_check CHECK (REGEXP_LIKE(iban, '^BY[0-9]{2}[A-Z0-9]{24}$', 'c')),
  CONSTRAINT accounts_kind_check CHECK (kind IN ('current', 'savings', 'deposit', 'loan', 'internal')),
  CONSTRAINT accounts_status_check CHECK (status IN ('open', 'frozen', 'closed')),
  CONSTRAINT accounts_min_balance_check CHECK (min_balance >= 0),
  -- у клиентских счетов должен быть владелец, у внутренних его нет
  CONSTRAINT accounts_owner_check CHECK ((kind = 'internal') = (owner_client_id IS NULL)),
  -- клиентский счёт нельзя уводить в минус (внутренние и ссудные счета могут иметь любой знак)
  CONSTRAINT accounts_balance_check CHECK (kind IN ('internal', 'loan') OR balance >= 0)
);
CREATE INDEX accounts_owner_idx ON accounts (owner_client_id);
-- у внутренних счетов пара «назначение, валюта» уникальна (для клиентских purpose = NULL, повторы допустимы)
CREATE UNIQUE INDEX accounts_purpose_idx ON accounts (purpose, currency);

-- Документ: одна бизнес-операция. Содержит набор проводок.
CREATE TABLE documents (
  id                BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type              VARCHAR(40) NOT NULL,
  status            VARCHAR(10) NOT NULL DEFAULT 'posted',
  idempotency_key   VARCHAR(120) NULL UNIQUE,
  initiated_by      BIGINT NULL,
  bank_date         DATE NOT NULL,
  description       VARCHAR(500) NOT NULL DEFAULT '',
  reverses_id       BIGINT NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (initiated_by) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (reverses_id) REFERENCES documents (id),
  CONSTRAINT documents_status_check CHECK (status IN ('pending', 'posted', 'reversed'))
);

-- Проводка: Дт счёт, Кт счёт, сумма в копейках. Не изменяется и не удаляется, ошибки исправляет сторно.
CREATE TABLE postings (
  id                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id        BIGINT NOT NULL,
  debit_account_id   BIGINT NOT NULL,
  credit_account_id  BIGINT NOT NULL,
  amount             BIGINT NOT NULL,
  currency           CHAR(3) NOT NULL,
  bank_date          DATE NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE RESTRICT,
  FOREIGN KEY (debit_account_id) REFERENCES accounts (id),
  FOREIGN KEY (credit_account_id) REFERENCES accounts (id),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT postings_amount_check CHECK (amount > 0),
  CONSTRAINT postings_accounts_check CHECK (debit_account_id <> credit_account_id)
);
CREATE INDEX postings_document_idx ON postings (document_id);
CREATE INDEX postings_debit_idx ON postings (debit_account_id, bank_date);
CREATE INDEX postings_credit_idx ON postings (credit_account_id, bank_date);

DELIMITER $$
CREATE TRIGGER postings_no_update BEFORE UPDATE ON postings
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица postings допускает только добавление записей';
END$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER postings_no_delete BEFORE DELETE ON postings
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица postings допускает только добавление записей';
END$$
DELIMITER ;

-- Проводка допустима, только если оба счёта в валюте проводки (конвертация идёт через счета банка)
DELIMITER $$
CREATE TRIGGER postings_currency BEFORE INSERT ON postings
  FOR EACH ROW
BEGIN
  DECLARE debit_currency CHAR(3);
  DECLARE credit_currency CHAR(3);
  SELECT currency INTO debit_currency FROM accounts WHERE id = NEW.debit_account_id;
  SELECT currency INTO credit_currency FROM accounts WHERE id = NEW.credit_account_id;
  IF debit_currency <> NEW.currency OR credit_currency <> NEW.currency THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Валюта проводки не совпадает с валютой счетов';
  END IF;
END$$
DELIMITER ;

-- Холды: суммы, зарезервированные на счёте до окончательного проведения
CREATE TABLE holds (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id   BIGINT NOT NULL,
  amount       BIGINT NOT NULL,
  document_id  BIGINT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at    DATETIME(3) NULL,
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT holds_amount_check CHECK (amount > 0),
  CONSTRAINT holds_status_check CHECK (status IN ('active', 'released', 'captured'))
);
CREATE INDEX holds_account_idx ON holds (account_id, status);

-- 003_reference.sql
-- Справочники: курсы, тарифы и лимиты

-- Курс Нацбанка. rate: сколько BYN за scale единиц валюты.
CREATE TABLE exchange_rates (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  currency   CHAR(3) NOT NULL,
  rate_date  DATE NOT NULL,
  rate       DECIMAL(14, 4) NOT NULL,
  scale      INT NOT NULL DEFAULT 1,
  UNIQUE (currency, rate_date),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT exchange_rates_rate_check CHECK (rate > 0),
  CONSTRAINT exchange_rates_scale_check CHECK (scale > 0)
);

-- Спред банка к курсу Нацбанка, в процентах. Задаёт администратор.
CREATE TABLE rate_spreads (
  currency      CHAR(3) NOT NULL PRIMARY KEY,
  buy_percent   DECIMAL(5, 2) NOT NULL DEFAULT 1.50,
  sell_percent  DECIMAL(5, 2) NOT NULL DEFAULT 1.50,
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT rate_spreads_buy_check CHECK (buy_percent >= 0),
  CONSTRAINT rate_spreads_sell_check CHECK (sell_percent >= 0)
);

-- Тарифы и лимиты: пары «код, значение», изменяются в админке
CREATE TABLE settings (
  `key`        VARCHAR(60) NOT NULL PRIMARY KEY,
  value        VARCHAR(500) NOT NULL,
  description  VARCHAR(300) NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- 004_transfers.sql
-- Переводы: заявки на перевод с подтверждением кодом

CREATE TABLE transfer_intents (
  id               CHAR(36) NOT NULL PRIMARY KEY,
  user_id          BIGINT NOT NULL,
  kind             VARCHAR(10) NOT NULL,
  from_account_id  BIGINT NOT NULL,
  to_account_id    BIGINT NOT NULL,
  amount           BIGINT NOT NULL,                  -- в валюте счёта списания
  amount_byn       BIGINT NOT NULL,                  -- эквивалент в BYN по курсу Нацбанка (для лимитов)
  fee              BIGINT NOT NULL DEFAULT 0,        -- в валюте счёта списания
  comment          VARCHAR(500) NOT NULL DEFAULT '',
  status           VARCHAR(10) NOT NULL DEFAULT 'new',
  document_id      BIGINT NULL,
  bank_date        DATE NULL,                        -- дата проведения
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (from_account_id) REFERENCES accounts (id),
  FOREIGN KEY (to_account_id) REFERENCES accounts (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT transfer_intents_kind_check CHECK (kind IN ('own', 'client')),
  CONSTRAINT transfer_intents_amount_check CHECK (amount > 0),
  CONSTRAINT transfer_intents_amount_byn_check CHECK (amount_byn > 0),
  CONSTRAINT transfer_intents_fee_check CHECK (fee >= 0),
  CONSTRAINT transfer_intents_status_check CHECK (status IN ('new', 'confirmed', 'cancelled', 'expired')),
  CONSTRAINT transfer_intents_accounts_check CHECK (from_account_id <> to_account_id)
);
CREATE INDEX transfer_intents_user_idx ON transfer_intents (user_id, status);

-- 005_deposits.sql
-- Вклады: продукты и договоры

CREATE TABLE deposit_products (
  id                   SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  currency             CHAR(3) NOT NULL,
  term_months          SMALLINT NOT NULL,
  rate_percent         DECIMAL(5, 2) NOT NULL,
  demand_rate_percent  DECIMAL(5, 2) NOT NULL DEFAULT 0.10,   -- ставка при досрочном расторжении
  min_amount           BIGINT NOT NULL,
  capitalization       BOOLEAN NOT NULL,   -- true: проценты прибавляются к вкладу, false: выплачиваются на текущий счёт
  revocable            BOOLEAN NOT NULL,   -- можно ли расторгнуть досрочно
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT deposit_products_term_check CHECK (term_months > 0),
  CONSTRAINT deposit_products_rate_check CHECK (rate_percent > 0),
  CONSTRAINT deposit_products_demand_check CHECK (demand_rate_percent >= 0),
  CONSTRAINT deposit_products_min_check CHECK (min_amount > 0)
);

CREATE TABLE deposits (
  id                   BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id            BIGINT NOT NULL,
  product_id           SMALLINT NOT NULL,
  account_id           BIGINT NOT NULL UNIQUE,    -- счёт вклада
  payout_account_id    BIGINT NOT NULL,           -- сюда возвращаются деньги и выплачиваются проценты
  currency             CHAR(3) NOT NULL,
  amount               BIGINT NOT NULL,           -- первоначальная сумма
  -- условия копируются из продукта, чтобы изменение продукта не меняло действующие договоры
  rate_percent         DECIMAL(5, 2) NOT NULL,
  demand_rate_percent  DECIMAL(5, 2) NOT NULL,
  capitalization       BOOLEAN NOT NULL,
  revocable            BOOLEAN NOT NULL,
  opened_date          DATE NOT NULL,
  maturity_date        DATE NOT NULL,
  paid_until           DATE NOT NULL,             -- проценты начислены по эту дату (не включая)
  periods_done         INT NOT NULL DEFAULT 0,
  interest_total       BIGINT NOT NULL DEFAULT 0, -- всего начислено процентов
  status               VARCHAR(12) NOT NULL DEFAULT 'active',
  closed_date          DATE NULL,
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (product_id) REFERENCES deposit_products (id),
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (payout_account_id) REFERENCES accounts (id),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT deposits_amount_check CHECK (amount > 0),
  CONSTRAINT deposits_status_check CHECK (status IN ('active', 'closed', 'early_closed')),
  CONSTRAINT deposits_dates_check CHECK (maturity_date > opened_date)
);
CREATE INDEX deposits_client_idx ON deposits (client_id);

-- 006_loans.sql
-- Кредиты: продукты, заявки, договоры и графики платежей

CREATE TABLE loan_products (
  id            SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  rate_percent  DECIMAL(5, 2) NOT NULL,
  min_amount    BIGINT NOT NULL,
  max_amount    BIGINT NOT NULL,
  min_term      SMALLINT NOT NULL,
  max_term      SMALLINT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT loan_products_rate_check CHECK (rate_percent > 0),
  CONSTRAINT loan_products_min_check CHECK (min_amount > 0),
  CONSTRAINT loan_products_max_check CHECK (max_amount >= min_amount),
  CONSTRAINT loan_products_term_check CHECK (min_term > 0 AND max_term >= min_term)
);

CREATE TABLE loan_applications (
  id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id           BIGINT NOT NULL,
  product_id          SMALLINT NOT NULL,
  target_account_id   BIGINT NOT NULL,   -- куда зачислить кредит и откуда списывать платежи
  amount              BIGINT NOT NULL,
  term_months         SMALLINT NOT NULL,
  schedule_type       VARCHAR(15) NOT NULL,
  rate_percent        DECIMAL(5, 2) NOT NULL,
  income              BIGINT NOT NULL,   -- ежемесячный доход, копейки
  obligations         BIGINT NOT NULL DEFAULT 0,   -- платежи по другим кредитам в месяц
  experience_months   INT NOT NULL,
  dependents          SMALLINT NOT NULL DEFAULT 0,
  first_payment       BIGINT NOT NULL,   -- ориентировочный первый платёж
  dti_percent         DECIMAL(6, 2) NOT NULL,   -- долговая нагрузка с учётом нового платежа
  score               SMALLINT NOT NULL,
  scoring_notes       JSON NOT NULL DEFAULT (JSON_ARRAY()),
  status              VARCHAR(15) NOT NULL,
  decision_comment    TEXT NULL,
  decided_by          BIGINT NULL,
  decided_at          DATETIME(3) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (product_id) REFERENCES loan_products (id),
  FOREIGN KEY (target_account_id) REFERENCES accounts (id),
  FOREIGN KEY (decided_by) REFERENCES users (id),
  CONSTRAINT loan_applications_amount_check CHECK (amount > 0),
  CONSTRAINT loan_applications_term_check CHECK (term_months > 0),
  CONSTRAINT loan_applications_type_check CHECK (schedule_type IN ('annuity', 'differentiated')),
  CONSTRAINT loan_applications_income_check CHECK (income > 0),
  CONSTRAINT loan_applications_obligations_check CHECK (obligations >= 0),
  CONSTRAINT loan_applications_experience_check CHECK (experience_months >= 0),
  CONSTRAINT loan_applications_dependents_check CHECK (dependents >= 0),
  CONSTRAINT loan_applications_status_check CHECK (status IN ('manual_review', 'approved', 'rejected', 'signed'))
);
CREATE INDEX loan_applications_status_idx ON loan_applications (status);
CREATE INDEX loan_applications_client_idx ON loan_applications (client_id);

CREATE TABLE loans (
  id                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id     BIGINT NOT NULL UNIQUE,
  client_id          BIGINT NOT NULL,
  account_id         BIGINT NOT NULL UNIQUE,   -- ссудный счёт
  payout_account_id  BIGINT NOT NULL,          -- счёт, с которого списываются платежи
  amount             BIGINT NOT NULL,
  rate_percent       DECIMAL(5, 2) NOT NULL,
  term_months        SMALLINT NOT NULL,
  schedule_type      VARCHAR(15) NOT NULL,
  opened_date        DATE NOT NULL,
  principal_balance  BIGINT NOT NULL,
  last_paid_date     DATE NOT NULL,            -- проценты уплачены по эту дату
  status             VARCHAR(10) NOT NULL DEFAULT 'active',
  closed_date        DATE NULL,
  FOREIGN KEY (application_id) REFERENCES loan_applications (id),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (payout_account_id) REFERENCES accounts (id),
  CONSTRAINT loans_amount_check CHECK (amount > 0),
  CONSTRAINT loans_type_check CHECK (schedule_type IN ('annuity', 'differentiated')),
  CONSTRAINT loans_principal_check CHECK (principal_balance >= 0),
  CONSTRAINT loans_status_check CHECK (status IN ('active', 'closed'))
);
CREATE INDEX loans_client_idx ON loans (client_id);

CREATE TABLE loan_schedule (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id       BIGINT NOT NULL,
  no            SMALLINT NOT NULL,
  due_date      DATE NOT NULL,
  principal     BIGINT NOT NULL,
  interest      BIGINT NOT NULL,
  penalty       BIGINT NOT NULL DEFAULT 0,
  penalty_from  DATE NULL,                      -- с какой даты считается пеня за просрочку
  status        VARCHAR(10) NOT NULL DEFAULT 'planned',
  paid_date     DATE NULL,
  UNIQUE (loan_id, no),
  FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE CASCADE,
  CONSTRAINT loan_schedule_principal_check CHECK (principal >= 0),
  CONSTRAINT loan_schedule_interest_check CHECK (interest >= 0),
  CONSTRAINT loan_schedule_penalty_check CHECK (penalty >= 0),
  CONSTRAINT loan_schedule_status_check CHECK (status IN ('planned', 'overdue', 'paid', 'cancelled'))
);
CREATE INDEX loan_schedule_due_idx ON loan_schedule (due_date, status);

-- 007_cards.sql
-- Виртуальные карты

CREATE TABLE cards (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id       BIGINT NOT NULL,
  account_id      BIGINT NOT NULL,
  `system`        VARCHAR(12) NOT NULL,
  number_enc      TEXT NOT NULL,                 -- номер карты в зашифрованном виде
  number_hash     VARCHAR(64) NOT NULL UNIQUE,
  last4           CHAR(4) NOT NULL,
  holder          VARCHAR(100) NOT NULL,
  expires         CHAR(5) NOT NULL,
  cvv_hash        VARCHAR(100) NOT NULL,         -- CVV и PIN хранятся только как хэш
  pin_hash        VARCHAR(100) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'active',
  per_op_limit    BIGINT NOT NULL DEFAULT 100000,
  daily_limit     BIGINT NOT NULL DEFAULT 300000,
  monthly_limit   BIGINT NOT NULL DEFAULT 1500000,
  online_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  replaced_by     BIGINT NULL,
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (replaced_by) REFERENCES cards (id),
  CONSTRAINT cards_system_check CHECK (`system` IN ('belkart', 'visa', 'mastercard')),
  CONSTRAINT cards_expires_check CHECK (REGEXP_LIKE(expires, '^[0-9]{2}/[0-9]{2}$')),
  CONSTRAINT cards_status_check CHECK (status IN ('active', 'blocked', 'closed')),
  CONSTRAINT cards_per_op_check CHECK (per_op_limit > 0),
  CONSTRAINT cards_daily_check CHECK (daily_limit >= per_op_limit),
  CONSTRAINT cards_monthly_check CHECK (monthly_limit >= daily_limit)
);
CREATE INDEX cards_client_idx ON cards (client_id);
CREATE INDEX cards_account_idx ON cards (account_id);

-- Операции по картам (для лимитов)
CREATE TABLE card_operations (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  card_id      BIGINT NOT NULL,
  document_id  BIGINT NOT NULL,
  amount       BIGINT NOT NULL,
  online       BOOLEAN NOT NULL,
  place        VARCHAR(200) NOT NULL DEFAULT '',
  bank_date    DATE NOT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (card_id) REFERENCES cards (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT card_operations_amount_check CHECK (amount > 0)
);
CREATE INDEX card_operations_card_idx ON card_operations (card_id, bank_date);

-- 008_payments.sql
-- Каталог платежей по образцу ЕРИП: категории, поставщики, платежи, шаблоны, автоплатежи

CREATE TABLE payment_categories (
  id    SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL,
  hint  VARCHAR(200) NOT NULL DEFAULT '',
  sort  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE payment_providers (
  id               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id      SMALLINT NOT NULL,
  name             VARCHAR(150) NOT NULL,
  city             VARCHAR(60) NULL,                 -- NULL: действует во всех городах
  requisite_label  VARCHAR(60) NOT NULL,             -- что вводит клиент: «Номер телефона», «Лицевой счёт»
  requisite_regex  VARCHAR(120) NOT NULL,            -- маска реквизита
  requisite_hint   VARCHAR(120) NOT NULL DEFAULT '',
  min_amount       BIGINT NOT NULL DEFAULT 100,
  max_amount       BIGINT NOT NULL DEFAULT 500000,
  fee_percent      DECIMAL(5, 2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (category_id) REFERENCES payment_categories (id),
  CONSTRAINT payment_providers_min_check CHECK (min_amount > 0),
  CONSTRAINT payment_providers_max_check CHECK (max_amount >= min_amount),
  CONSTRAINT payment_providers_fee_check CHECK (fee_percent >= 0)
);
CREATE INDEX payment_providers_category_idx ON payment_providers (category_id);

CREATE TABLE payments (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id        BIGINT NOT NULL,
  provider_id      INT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  amount           BIGINT NOT NULL,
  fee              BIGINT NOT NULL DEFAULT 0,
  requisite        VARCHAR(60) NOT NULL,
  document_id      BIGINT NOT NULL,
  source           VARCHAR(10) NOT NULL DEFAULT 'manual',
  bank_date        DATE NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (provider_id) REFERENCES payment_providers (id),
  FOREIGN KEY (from_account_id) REFERENCES accounts (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_fee_check CHECK (fee >= 0),
  CONSTRAINT payments_source_check CHECK (source IN ('manual', 'autopay'))
);
CREATE INDEX payments_client_idx ON payments (client_id, id DESC);

CREATE TABLE payment_templates (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id        BIGINT NOT NULL,
  provider_id      INT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  name             VARCHAR(100) NOT NULL,
  requisite        VARCHAR(60) NOT NULL,
  amount           BIGINT NULL,
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES payment_providers (id),
  FOREIGN KEY (from_account_id) REFERENCES accounts (id),
  CONSTRAINT payment_templates_amount_check CHECK (amount IS NULL OR amount > 0)
);
CREATE INDEX payment_templates_client_idx ON payment_templates (client_id);

CREATE TABLE autopayments (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id     BIGINT NOT NULL,
  template_id   BIGINT NOT NULL,
  amount        BIGINT NOT NULL,
  day_of_month  SMALLINT NOT NULL,
  next_date     DATE NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  fail_count    SMALLINT NOT NULL DEFAULT 0,
  last_result   VARCHAR(300) NOT NULL DEFAULT '',
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES payment_templates (id) ON DELETE CASCADE,
  CONSTRAINT autopayments_amount_check CHECK (amount > 0),
  CONSTRAINT autopayments_day_check CHECK (day_of_month BETWEEN 1 AND 28)
);
CREATE INDEX autopayments_due_idx ON autopayments (next_date, active);

-- 009_fraud.sql
-- Антифрод: случаи подозрительных операций и холды для задержанных переводов

ALTER TABLE transfer_intents DROP CHECK transfer_intents_status_check;
ALTER TABLE transfer_intents ADD CONSTRAINT transfer_intents_status_check
  CHECK (status IN ('new', 'review', 'confirmed', 'cancelled', 'expired', 'rejected'));

ALTER TABLE holds ADD COLUMN intent_id CHAR(36) NULL;
ALTER TABLE holds ADD CONSTRAINT holds_intent_fk FOREIGN KEY (intent_id) REFERENCES transfer_intents (id);

CREATE TABLE fraud_cases (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  intent_id        CHAR(36) NOT NULL,
  user_id          BIGINT NOT NULL,
  score            SMALLINT NOT NULL,
  reasons          JSON NOT NULL DEFAULT (JSON_ARRAY()),
  decision         VARCHAR(10) NOT NULL,
  status           VARCHAR(10) NOT NULL,
  special_control  BOOLEAN NOT NULL DEFAULT FALSE,   -- операция особого контроля (Закон № 165-З)
  amount_byn       BIGINT NOT NULL,
  reviewed_by      BIGINT NULL,
  reviewed_at      DATETIME(3) NULL,
  comment          TEXT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intent_id) REFERENCES transfer_intents (id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (reviewed_by) REFERENCES users (id),
  CONSTRAINT fraud_cases_decision_check CHECK (decision IN ('confirm', 'review', 'special')),
  CONSTRAINT fraud_cases_status_check CHECK (status IN ('open', 'auto', 'approved', 'rejected'))
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

INSERT INTO settings (`key`, value, description) VALUES
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

INSERT INTO settings (`key`, value, description) VALUES
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
  (1, 'Горводоканал', 'Минск',   'Лицевой счёт', '^\\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Энергосбыт', NULL,       'Лицевой счёт', '^\\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Горгаз', 'Брест',        'Лицевой счёт', '^\\d{9}$', '9 цифр с квитанции', 100, 200000, 0),
  (1, 'Теплосеть', 'Гомель',    'Лицевой счёт', '^\\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (1, 'Жилищно-эксплуатационный участок', 'Витебск', 'Лицевой счёт', '^\\d{8,10}$', '8-10 цифр с квитанции', 100, 300000, 0),
  (2, 'Мобильный оператор «Синий»', NULL, 'Номер телефона', '^\\+375\\d{9}$', 'В формате +375291234567', 100, 100000, 0),
  (2, 'Мобильный оператор «Зелёный»', NULL, 'Номер телефона', '^\\+375\\d{9}$', 'В формате +375331234567', 100, 100000, 0),
  (3, 'Интернет-провайдер «Сеть»', 'Минск', 'Номер договора', '^[A-Z0-9]{6,12}$', '6-12 символов из договора', 500, 200000, 0),
  (3, 'Цифровое телевидение', NULL, 'Номер договора', '^\\d{7,10}$', '7-10 цифр', 500, 100000, 0.50),
  (4, 'Налоговая инспекция', NULL, 'Идентификационный номер', '^\\d{7}[A-Z]\\d{3}[A-Z]{2}\\d$', 'Как в паспорте', 100, 5000000, 0),
  (4, 'ГАИ: штрафы', NULL, 'Номер постановления', '^\\d{12,16}$', '12-16 цифр', 100, 1000000, 0),
  (5, 'Детский сад', 'Минск', 'Номер договора', '^\\d{6,10}$', '6-10 цифр', 100, 100000, 0),
  (5, 'Университет', NULL, 'Номер договора', '^[A-Z0-9-]{6,14}$', 'Из договора на обучение', 1000, 2000000, 0),
  (6, 'Городской транспорт', 'Минск', 'Номер проездной карты', '^\\d{10}$', '10 цифр на карте', 500, 50000, 0),
  (6, 'Парковки', NULL, 'Номер автомобиля', '^[A-Z0-9]{4,10}$', 'Например 1234AB7', 100, 100000, 0);

-- 014_seed_fraud.sql
INSERT INTO settings (`key`, value, description) VALUES
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

ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL;     -- последний использованный временной интервал (защита от повторного ввода кода)
ALTER TABLE users ADD CONSTRAINT totp_secret_required CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

CREATE TABLE recovery_codes (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  code_hash  VARCHAR(100) NOT NULL,
  used_at    DATETIME(3) NULL,
  UNIQUE (user_id, code_hash),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  type        VARCHAR(30) NOT NULL,                    -- вид события: transfer, loan, deposit, card, security ...
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(1000) NOT NULL DEFAULT '',
  link        VARCHAR(200) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at     DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id, read_at);

-- напоминание о платеже по кредиту отправляется один раз
ALTER TABLE loan_schedule ADD COLUMN reminded BOOLEAN NOT NULL DEFAULT FALSE;

-- 017_staff_2fa.sql
INSERT INTO settings (`key`, value, description) VALUES
  ('security.require_2fa_staff', '1', 'Обязательная двухфакторная защита для сотрудников банка: 1 да, 0 нет');

-- 018_interbank.sql
-- Межбанковские переводы: справочник банков, пакеты клиринга, платежи

CREATE TABLE external_banks (
  code    CHAR(4) NOT NULL PRIMARY KEY,           -- код банка в номере IBAN (позиции 5-8)
  name    VARCHAR(100) NOT NULL,
  bic     VARCHAR(11) NOT NULL UNIQUE,
  active  BOOLEAN NOT NULL DEFAULT TRUE           -- неактивный банк не принимает платежи, они возвращаются отправителю
);

-- Клиринговый пакет: все исходящие платежи за банковскую дату отправляются одним пакетом
CREATE TABLE clearing_batches (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bank_date   DATE NOT NULL UNIQUE,
  transfers   INT NOT NULL DEFAULT 0,
  rejected    INT NOT NULL DEFAULT 0,
  total       BIGINT NOT NULL DEFAULT 0,          -- сумма отправленных платежей, копейки BYN
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE interbank_transfers (
  id                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT NULL,                  -- клиент (исходящий) или операционист (входящий)
  account_id         BIGINT NOT NULL,              -- счёт клиента нашего банка
  direction          VARCHAR(3) NOT NULL,
  bank_code          CHAR(4) NOT NULL,
  counterparty_name  VARCHAR(150) NOT NULL,
  counterparty_iban  CHAR(28) NOT NULL,
  amount             BIGINT NOT NULL,
  fee                BIGINT NOT NULL DEFAULT 0,
  purpose            VARCHAR(300) NOT NULL DEFAULT '',
  status             VARCHAR(12) NOT NULL,
  hold_id            BIGINT NULL,
  document_id        BIGINT NULL,
  batch_id           BIGINT NULL,
  reject_reason      VARCHAR(300) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at         DATETIME(3) NULL,
  sent_date          DATE NULL,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (bank_code) REFERENCES external_banks (code),
  FOREIGN KEY (hold_id) REFERENCES holds (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  FOREIGN KEY (batch_id) REFERENCES clearing_batches (id),
  CONSTRAINT interbank_direction_check CHECK (direction IN ('out', 'in')),
  CONSTRAINT interbank_amount_check CHECK (amount > 0),
  CONSTRAINT interbank_fee_check CHECK (fee >= 0),
  CONSTRAINT interbank_transfers_status_check CHECK (status IN ('pending_otp', 'queued', 'sent', 'rejected', 'cancelled'))
);
CREATE INDEX interbank_account_idx ON interbank_transfers (account_id, id DESC);
CREATE INDEX interbank_queue_idx ON interbank_transfers (status, id);

-- 019_seed_interbank.sql
INSERT INTO external_banks (code, name, bic, active) VALUES
  ('DRZH', 'ДорожныйБанк', 'DRZHBY2X', true),
  ('MRKT', 'Рыночный банк', 'MRKTBY2X', true),
  ('ZKRT', 'Закрывшийся банк', 'ZKRTBY2X', false);

INSERT INTO settings (`key`, value, description) VALUES
  ('interbank.fee_percent', '0.5',    'Комиссия за перевод в другой банк, %'),
  ('interbank.min_fee',     '50',     'Минимальная комиссия за перевод в другой банк, копейки BYN'),
  ('interbank.max_amount',  '1000000','Максимальная сумма перевода в другой банк, копейки BYN');

-- 020_cny.sql
-- Китайский юань: пятая валюта счетов и курсов
INSERT INTO currencies (code, numeric_code, name) VALUES ('CNY', '156', 'Китайский юань');
INSERT INTO rate_spreads (currency) VALUES ('CNY');

-- 021_payment_categories.sql
-- Категории каталога платежей по макету: связь и интернет вместе, добавлена благотворительность
UPDATE payment_categories SET name = 'Жилищно-коммунальные услуги' WHERE name = 'Жильё и коммунальные услуги';
UPDATE payment_categories SET name = 'Связь и интернет', hint = 'Мобильная связь, интернет, телевидение' WHERE name = 'Связь';
UPDATE payment_providers SET category_id = (SELECT id FROM payment_categories WHERE name = 'Связь и интернет')
  WHERE category_id = (SELECT id FROM payment_categories WHERE name = 'Интернет и телевидение');
DELETE FROM payment_categories WHERE name = 'Интернет и телевидение';
UPDATE payment_categories SET sort = 3 WHERE name = 'Налоги и штрафы';
UPDATE payment_categories SET sort = 4 WHERE name = 'Образование';
UPDATE payment_categories SET sort = 5 WHERE name = 'Транспорт';
INSERT INTO payment_categories (name, hint, sort) VALUES ('Благотворительность', 'Фонды помощи детям и животным', 6);
INSERT INTO payment_providers (category_id, name, city, requisite_label, requisite_regex, requisite_hint, min_amount, max_amount, fee_percent) VALUES
  ((SELECT id FROM payment_categories WHERE name = 'Благотворительность'), 'Фонд помощи детям', NULL, 'Номер пожертвования', '^\\d{4,10}$', '4-10 цифр, например 7001', 100, 500000, 0),
  ((SELECT id FROM payment_categories WHERE name = 'Благотворительность'), 'Приют для животных', NULL, 'Номер пожертвования', '^\\d{4,10}$', '4-10 цифр, например 7002', 100, 500000, 0);

-- 022_interbank_antifraud.sql
-- Антифрод для переводов в другие банки: риск считается при оформлении, задержанный платёж ждёт специалиста

ALTER TABLE interbank_transfers DROP CHECK interbank_transfers_status_check;
ALTER TABLE interbank_transfers ADD CONSTRAINT interbank_transfers_status_check
  CHECK (status IN ('pending_otp', 'review', 'queued', 'sent', 'rejected', 'cancelled'));

ALTER TABLE interbank_transfers
  ADD COLUMN risk_score    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN risk_reasons  JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN risk_decision VARCHAR(10) NOT NULL DEFAULT 'allow',
  ADD COLUMN risk_special  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT interbank_risk_decision_check CHECK (risk_decision IN ('allow', 'confirm', 'review'));

-- Случай антифрода относится либо к переводу клиенту банка, либо к переводу в другой банк
ALTER TABLE fraud_cases MODIFY intent_id CHAR(36) NULL;
ALTER TABLE fraud_cases ADD COLUMN interbank_id BIGINT NULL;
ALTER TABLE fraud_cases ADD CONSTRAINT fraud_cases_interbank_fk FOREIGN KEY (interbank_id) REFERENCES interbank_transfers (id);
ALTER TABLE fraud_cases ADD CONSTRAINT fraud_cases_target_check CHECK ((intent_id IS NOT NULL) <> (interbank_id IS NOT NULL));

-- 023_mail.sql
-- Почта: очередь исходящих писем (transactional outbox) и согласие клиента на дублирование уведомлений

ALTER TABLE users ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE mail_outbox (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NULL,
  to_email    VARCHAR(254) NOT NULL,
  subject     VARCHAR(300) NOT NULL,
  body        TEXT NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending',
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at     DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT mail_outbox_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (status, id);

-- 024_scoring_model.sql
-- Регрессионный скоринг: обученные модели логистической регрессии и результат оценки в заявке

CREATE TABLE scoring_models (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version       INT NOT NULL UNIQUE,
  coefficients  JSON NOT NULL,                              -- {mean, std, weights, bias} в порядке признаков из lib/regression.js
  metrics       JSON NOT NULL DEFAULT (JSON_OBJECT()),      -- точность, AUC, KS на тестовой выборке
  samples       INT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  -- активной может быть только одна модель: у остальных active_flag = NULL, а NULL в уникальном индексе допускаются
  active_flag   TINYINT GENERATED ALWAYS AS (IF(active, 1, NULL)) STORED,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (active_flag)
);

ALTER TABLE loan_applications
  ADD COLUMN pd_percent    DECIMAL(5, 2) NULL,     -- вероятность дефолта по модели, %
  ADD COLUMN model_version INT NULL;

INSERT INTO settings (`key`, value, description) VALUES
  ('loan.scoring_regression', '1',  'Решение по заявке принимает регрессионная модель (1) или балльная карта (0)'),
  ('loan.pd_approve',         '8',   'Автоодобрение при вероятности дефолта не выше, %'),
  ('loan.pd_manual',          '30',  'Ручное рассмотрение при вероятности дефолта не выше, % (выше: отказ)');
