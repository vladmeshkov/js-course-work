-- Каталог платежей по образцу ЕРИП: категории, поставщики, платежи, шаблоны, автоплатежи

CREATE TABLE payment_categories (
  id    smallserial PRIMARY KEY,
  name  text NOT NULL,
  hint  text NOT NULL DEFAULT '',
  sort  smallint NOT NULL DEFAULT 0
);

CREATE TABLE payment_providers (
  id               serial PRIMARY KEY,
  category_id      smallint NOT NULL REFERENCES payment_categories (id),
  name             text NOT NULL,
  city             text,                         -- NULL: действует во всех городах
  requisite_label  text NOT NULL,                -- что вводит клиент: «Номер телефона», «Лицевой счёт»
  requisite_regex  text NOT NULL,                -- маска реквизита
  requisite_hint   text NOT NULL DEFAULT '',
  min_amount       bigint NOT NULL DEFAULT 100 CHECK (min_amount > 0),
  max_amount       bigint NOT NULL DEFAULT 500000 CHECK (max_amount >= min_amount),
  fee_percent      numeric(5, 2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0),
  active           boolean NOT NULL DEFAULT true
);
CREATE INDEX payment_providers_category_idx ON payment_providers (category_id);

CREATE TABLE payments (
  id               bigserial PRIMARY KEY,
  client_id        bigint NOT NULL REFERENCES clients (id),
  provider_id      integer NOT NULL REFERENCES payment_providers (id),
  from_account_id  bigint NOT NULL REFERENCES accounts (id),
  amount           bigint NOT NULL CHECK (amount > 0),
  fee              bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  requisite        text NOT NULL,
  document_id      bigint NOT NULL REFERENCES documents (id),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'autopay')),
  bank_date        date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_client_idx ON payments (client_id, id DESC);

CREATE TABLE payment_templates (
  id               bigserial PRIMARY KEY,
  client_id        bigint NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  provider_id      integer NOT NULL REFERENCES payment_providers (id),
  from_account_id  bigint NOT NULL REFERENCES accounts (id),
  name             text NOT NULL,
  requisite        text NOT NULL,
  amount           bigint CHECK (amount IS NULL OR amount > 0)
);
CREATE INDEX payment_templates_client_idx ON payment_templates (client_id);

CREATE TABLE autopayments (
  id             bigserial PRIMARY KEY,
  client_id      bigint NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  template_id    bigint NOT NULL REFERENCES payment_templates (id) ON DELETE CASCADE,
  amount         bigint NOT NULL CHECK (amount > 0),
  day_of_month   smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  next_date      date NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  fail_count     smallint NOT NULL DEFAULT 0,
  last_result    text NOT NULL DEFAULT ''
);
CREATE INDEX autopayments_due_idx ON autopayments (next_date) WHERE active;
