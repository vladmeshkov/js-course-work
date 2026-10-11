-- Учёт денег: валюты, счета, документы и проводки (двойная запись)

CREATE TABLE currencies (
  code         char(3) PRIMARY KEY,
  numeric_code char(3) NOT NULL UNIQUE,
  name         text NOT NULL
);

-- Банковская дата. Одна строка. Меняется при закрытии операционного дня.
CREATE TABLE bank_state (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  bank_date   date NOT NULL
);

CREATE SEQUENCE account_number_seq START 1;

-- Счета клиентов и внутренние счета банка (owner_client_id IS NULL).
-- balance хранится в копейках и является кэшем: он обновляется в той же транзакции, что и проводки.
CREATE TABLE accounts (
  id               bigserial PRIMARY KEY,
  iban             char(28) NOT NULL UNIQUE CHECK (iban ~ '^BY[0-9]{2}[A-Z0-9]{24}$'),
  owner_client_id  bigint REFERENCES clients (id) ON DELETE RESTRICT,
  balance_code     char(4) NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('current', 'savings', 'deposit', 'loan', 'internal')),
  title            text NOT NULL,
  -- назначение внутреннего счёта: cash, income, expense и т. д. (для клиентских счетов NULL)
  purpose          text,
  currency         char(3) NOT NULL REFERENCES currencies (code),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'frozen', 'closed')),
  balance          bigint NOT NULL DEFAULT 0,
  min_balance      bigint NOT NULL DEFAULT 0 CHECK (min_balance >= 0),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  -- у клиентских счетов должен быть владелец, у внутренних его нет
  CHECK ((kind = 'internal') = (owner_client_id IS NULL)),
  -- клиентский счёт нельзя уводить в минус (внутренние и ссудные счета могут иметь любой знак)
  CHECK (kind IN ('internal', 'loan') OR balance >= 0)
);
CREATE INDEX accounts_owner_idx ON accounts (owner_client_id);
CREATE UNIQUE INDEX accounts_purpose_idx ON accounts (purpose, currency) WHERE purpose IS NOT NULL;

-- Документ: одна бизнес-операция. Содержит набор проводок.
CREATE TABLE documents (
  id                bigserial PRIMARY KEY,
  type              text NOT NULL,
  status            text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'reversed')),
  idempotency_key   text UNIQUE,
  initiated_by      bigint REFERENCES users (id) ON DELETE SET NULL,
  bank_date         date NOT NULL,
  description       text NOT NULL DEFAULT '',
  reverses_id       bigint REFERENCES documents (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Проводка: Дт счёт, Кт счёт, сумма в копейках. Не изменяется и не удаляется, ошибки исправляет сторно.
CREATE TABLE postings (
  id                 bigserial PRIMARY KEY,
  document_id        bigint NOT NULL REFERENCES documents (id) ON DELETE RESTRICT,
  debit_account_id   bigint NOT NULL REFERENCES accounts (id),
  credit_account_id  bigint NOT NULL REFERENCES accounts (id),
  amount             bigint NOT NULL CHECK (amount > 0),
  currency           char(3) NOT NULL REFERENCES currencies (code),
  bank_date          date NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account_id <> credit_account_id)
);
CREATE INDEX postings_document_idx ON postings (document_id);
CREATE INDEX postings_debit_idx ON postings (debit_account_id, bank_date);
CREATE INDEX postings_credit_idx ON postings (credit_account_id, bank_date);

CREATE TRIGGER postings_append_only
  BEFORE UPDATE OR DELETE ON postings
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Проводка допустима, только если оба счёта в валюте проводки (конвертация идёт через счета банка)
CREATE FUNCTION check_posting_currency() RETURNS trigger AS $$
DECLARE
  debit_currency char(3);
  credit_currency char(3);
BEGIN
  SELECT currency INTO debit_currency FROM accounts WHERE id = NEW.debit_account_id;
  SELECT currency INTO credit_currency FROM accounts WHERE id = NEW.credit_account_id;
  IF debit_currency <> NEW.currency OR credit_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Валюта проводки не совпадает с валютой счетов';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER postings_currency
  BEFORE INSERT ON postings
  FOR EACH ROW EXECUTE FUNCTION check_posting_currency();

-- Холды: суммы, зарезервированные на счёте до окончательного проведения
CREATE TABLE holds (
  id           bigserial PRIMARY KEY,
  account_id   bigint NOT NULL REFERENCES accounts (id),
  amount       bigint NOT NULL CHECK (amount > 0),
  document_id  bigint REFERENCES documents (id),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'captured')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);
CREATE INDEX holds_account_idx ON holds (account_id) WHERE status = 'active';
