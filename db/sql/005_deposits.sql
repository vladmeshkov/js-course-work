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
