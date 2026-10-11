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
