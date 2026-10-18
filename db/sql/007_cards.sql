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
