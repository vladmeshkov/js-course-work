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
