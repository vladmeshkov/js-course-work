-- Межбанковские переводы: справочник банков, пакеты клиринга, платежи

CREATE TABLE external_banks (
  code    char(4) PRIMARY KEY,          -- код банка в номере IBAN (позиции 5-8)
  name    text NOT NULL,
  bic     text NOT NULL UNIQUE,
  active  boolean NOT NULL DEFAULT true -- неактивный банк не принимает платежи, они возвращаются отправителю
);

-- Клиринговый пакет: все исходящие платежи за банковскую дату отправляются одним пакетом
CREATE TABLE clearing_batches (
  id          bigserial PRIMARY KEY,
  bank_date   date NOT NULL UNIQUE,
  transfers   integer NOT NULL DEFAULT 0,
  rejected    integer NOT NULL DEFAULT 0,
  total       bigint NOT NULL DEFAULT 0,   -- сумма отправленных платежей, копейки BYN
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interbank_transfers (
  id                bigserial PRIMARY KEY,
  user_id           bigint REFERENCES users (id),                 -- клиент (исходящий) или операционист (входящий)
  account_id        bigint NOT NULL REFERENCES accounts (id),     -- счёт клиента нашего банка
  direction         text NOT NULL CHECK (direction IN ('out', 'in')),
  bank_code         char(4) NOT NULL REFERENCES external_banks (code),
  counterparty_name text NOT NULL,
  counterparty_iban char(28) NOT NULL,
  amount            bigint NOT NULL CHECK (amount > 0),
  fee               bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  purpose           text NOT NULL DEFAULT '',
  status            text NOT NULL CHECK (status IN ('pending_otp', 'queued', 'sent', 'rejected', 'cancelled')),
  hold_id           bigint REFERENCES holds (id),
  document_id       bigint REFERENCES documents (id),
  batch_id          bigint REFERENCES clearing_batches (id),
  reject_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  sent_date         date
);
CREATE INDEX interbank_account_idx ON interbank_transfers (account_id, id DESC);
CREATE INDEX interbank_queue_idx ON interbank_transfers (id) WHERE status = 'queued';
