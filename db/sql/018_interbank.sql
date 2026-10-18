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
