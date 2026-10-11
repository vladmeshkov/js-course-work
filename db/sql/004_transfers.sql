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
