-- Каталог платежей по образцу ЕРИП: категории, поставщики, платежи, шаблоны, автоплатежи

CREATE TABLE payment_categories (
  id    SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL,
  hint  VARCHAR(200) NOT NULL DEFAULT '',
  sort  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE payment_providers (
  id               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id      SMALLINT NOT NULL,
  name             VARCHAR(150) NOT NULL,
  city             VARCHAR(60) NULL,                 -- NULL: действует во всех городах
  requisite_label  VARCHAR(60) NOT NULL,             -- что вводит клиент: «Номер телефона», «Лицевой счёт»
  requisite_regex  VARCHAR(120) NOT NULL,            -- маска реквизита
  requisite_hint   VARCHAR(120) NOT NULL DEFAULT '',
  min_amount       BIGINT NOT NULL DEFAULT 100,
  max_amount       BIGINT NOT NULL DEFAULT 500000,
  fee_percent      DECIMAL(5, 2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (category_id) REFERENCES payment_categories (id),
  CONSTRAINT payment_providers_min_check CHECK (min_amount > 0),
  CONSTRAINT payment_providers_max_check CHECK (max_amount >= min_amount),
  CONSTRAINT payment_providers_fee_check CHECK (fee_percent >= 0)
);
CREATE INDEX payment_providers_category_idx ON payment_providers (category_id);

CREATE TABLE payments (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id        BIGINT NOT NULL,
  provider_id      INT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  amount           BIGINT NOT NULL,
  fee              BIGINT NOT NULL DEFAULT 0,
  requisite        VARCHAR(60) NOT NULL,
  document_id      BIGINT NOT NULL,
  source           VARCHAR(10) NOT NULL DEFAULT 'manual',
  bank_date        DATE NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (provider_id) REFERENCES payment_providers (id),
  FOREIGN KEY (from_account_id) REFERENCES accounts (id),
  FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_fee_check CHECK (fee >= 0),
  CONSTRAINT payments_source_check CHECK (source IN ('manual', 'autopay'))
);
CREATE INDEX payments_client_idx ON payments (client_id, id DESC);

CREATE TABLE payment_templates (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id        BIGINT NOT NULL,
  provider_id      INT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  name             VARCHAR(100) NOT NULL,
  requisite        VARCHAR(60) NOT NULL,
  amount           BIGINT NULL,
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES payment_providers (id),
  FOREIGN KEY (from_account_id) REFERENCES accounts (id),
  CONSTRAINT payment_templates_amount_check CHECK (amount IS NULL OR amount > 0)
);
CREATE INDEX payment_templates_client_idx ON payment_templates (client_id);

CREATE TABLE autopayments (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id     BIGINT NOT NULL,
  template_id   BIGINT NOT NULL,
  amount        BIGINT NOT NULL,
  day_of_month  SMALLINT NOT NULL,
  next_date     DATE NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  fail_count    SMALLINT NOT NULL DEFAULT 0,
  last_result   VARCHAR(300) NOT NULL DEFAULT '',
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES payment_templates (id) ON DELETE CASCADE,
  CONSTRAINT autopayments_amount_check CHECK (amount > 0),
  CONSTRAINT autopayments_day_check CHECK (day_of_month BETWEEN 1 AND 28)
);
CREATE INDEX autopayments_due_idx ON autopayments (next_date, active);
