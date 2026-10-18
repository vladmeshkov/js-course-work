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
