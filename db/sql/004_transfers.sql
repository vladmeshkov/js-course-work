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
