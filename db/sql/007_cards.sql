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
