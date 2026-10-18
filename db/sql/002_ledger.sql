-- Учёт денег: валюты, счета, документы и проводки (двойная запись)

CREATE TABLE currencies (
  code          CHAR(3) NOT NULL PRIMARY KEY,
  numeric_code  CHAR(3) NOT NULL UNIQUE,
  name          VARCHAR(60) NOT NULL
);

-- Банковская дата. Одна строка. Меняется при закрытии операционного дня.
CREATE TABLE bank_state (
  id         TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  bank_date  DATE NOT NULL,
  CONSTRAINT bank_state_single CHECK (id = 1)
);

-- Источник последовательных номеров счетов (номер берётся из AUTO_INCREMENT)
CREATE TABLE account_number_seq (
  n BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
);

-- Счета клиентов и внутренние счета банка (owner_client_id IS NULL).
-- balance хранится в копейках и является кэшем: он обновляется в той же транзакции, что и проводки.
CREATE TABLE accounts (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iban             CHAR(28) NOT NULL UNIQUE,
  owner_client_id  BIGINT NULL,
  balance_code     CHAR(4) NOT NULL,
  kind             VARCHAR(10) NOT NULL,
  title            VARCHAR(120) NOT NULL,
  -- назначение внутреннего счёта: cash, income, expense и т. д. (для клиентских счетов NULL)
  purpose          VARCHAR(30) NULL,
  currency         CHAR(3) NOT NULL,
  status           VARCHAR(8) NOT NULL DEFAULT 'open',
  balance          BIGINT NOT NULL DEFAULT 0,
  min_balance      BIGINT NOT NULL DEFAULT 0,
  opened_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at        DATETIME(3) NULL,
  FOREIGN KEY (owner_client_id) REFERENCES clients (id) ON DELETE RESTRICT,
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT accounts_iban_check CHECK (REGEXP_LIKE(iban, '^BY[0-9]{2}[A-Z0-9]{24}$', 'c')),
  CONSTRAINT accounts_kind_check CHECK (kind IN ('current', 'savings', 'deposit', 'loan', 'internal')),
  CONSTRAINT accounts_status_check CHECK (status IN ('open', 'frozen', 'closed')),
  CONSTRAINT accounts_min_balance_check CHECK (min_balance >= 0),
  -- у клиентских счетов должен быть владелец, у внутренних его нет
  CONSTRAINT accounts_owner_check CHECK ((kind = 'internal') = (owner_client_id IS NULL)),
  -- клиентский счёт нельзя уводить в минус (внутренние и ссудные счета могут иметь любой знак)
  CONSTRAINT accounts_balance_check CHECK (kind IN ('internal', 'loan') OR balance >= 0)
);
CREATE INDEX accounts_owner_idx ON accounts (owner_client_id);
-- у внутренних счетов пара «назначение, валюта» уникальна (для клиентских purpose = NULL, повторы допустимы)
CREATE UNIQUE INDEX accounts_purpose_idx ON accounts (purpose, currency);

-- Документ: одна бизнес-операция. Содержит набор проводок.
CREATE TABLE documents (
  id                BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type              VARCHAR(40) NOT NULL,
  status            VARCHAR(10) NOT NULL DEFAULT 'posted',
  idempotency_key   VARCHAR(120) NULL UNIQUE,
  initiated_by      BIGINT NULL,
  bank_date         DATE NOT NULL,
  description       VARCHAR(500) NOT NULL DEFAULT '',
  reverses_id       BIGINT NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (initiated_by) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (reverses_id) REFERENCES documents (id),
  CONSTRAINT documents_status_check CHECK (status IN ('pending', 'posted', 'reversed'))
);

-- Проводка: Дт счёт, Кт счёт, сумма в копейках. Не изменяется и не удаляется, ошибки исправляет сторно.
CREATE TABLE postings (
  id                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id        BIGINT NOT NULL,
  debit_account_id   BIGINT NOT NULL,
  credit_account_id  BIGINT NOT NULL,
  amount             BIGINT NOT NULL,
  currency           CHAR(3) NOT NULL,
  bank_date          DATE NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE RESTRICT,
  FOREIGN KEY (debit_account_id) REFERENCES accounts (id),
  FOREIGN KEY (credit_account_id) REFERENCES accounts (id),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT postings_amount_check CHECK (amount > 0),
  CONSTRAINT postings_accounts_check CHECK (debit_account_id <> credit_account_id)
);
CREATE INDEX postings_document_idx ON postings (document_id);
CREATE INDEX postings_debit_idx ON postings (debit_account_id, bank_date);
CREATE INDEX postings_credit_idx ON postings (credit_account_id, bank_date);

CREATE TRIGGER postings_no_update BEFORE UPDATE ON postings
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица postings допускает только добавление записей';
END;
CREATE TRIGGER postings_no_delete BEFORE DELETE ON postings
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица postings допускает только добавление записей';
END;

-- Проводка допустима, только если оба счёта в валюте проводки (конвертация идёт через счета банка)
CREATE TRIGGER postings_currency BEFORE INSERT ON postings
  FOR EACH ROW
BEGIN
  DECLARE debit_currency CHAR(3);
  DECLARE credit_currency CHAR(3);
  SELECT currency INTO debit_currency FROM accounts WHERE id = NEW.debit_account_id;
  SELECT currency INTO credit_currency FROM accounts WHERE id = NEW.credit_account_id;
  IF debit_currency <> NEW.currency OR credit_currency <> NEW.currency THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Валюта проводки не совпадает с валютой счетов';
  END IF;
END;

-- Холды: суммы, зарезервированные на счёте до окончательного проведения
CREATE TABLE holds (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id   BIGINT NOT NULL,
  amount       BIGINT NOT NULL,
  document_id  BIGINT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at    DATETIME(3) NULL,
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT holds_amount_check CHECK (amount > 0),
  CONSTRAINT holds_status_check CHECK (status IN ('active', 'released', 'captured'))
);
CREATE INDEX holds_account_idx ON holds (account_id, status);
