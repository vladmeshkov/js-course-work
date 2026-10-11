-- ТалерБанк: учебная выжимка схемы для диаграммы в MySQL Workbench.
-- Сформирована скриптом scripts/er-mysql.js из рабочей базы PostgreSQL: только главные таблицы, ключи и основные поля.
-- Использовать только для построения ER-диаграммы. Полный скрипт рабочей базы: db/schema.sql.

CREATE SCHEMA IF NOT EXISTS talerbank DEFAULT CHARACTER SET utf8mb4;
USE talerbank;

CREATE TABLE `roles` (
  `id` SMALLINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB;

CREATE TABLE `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `login` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` SMALLINT NOT NULL,
  `status` VARCHAR(255) NOT NULL,
  `failed_attempts` INT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_users_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `clients` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `last_name` VARCHAR(255) NOT NULL,
  `first_name` VARCHAR(255) NOT NULL,
  `patronymic` VARCHAR(255) NULL,
  `birth_date` DATE NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_clients_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `accounts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `iban` CHAR(28) NOT NULL,
  `owner_client_id` BIGINT NULL,
  `balance_code` CHAR(4) NOT NULL,
  `kind` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_accounts_owner_client_id` FOREIGN KEY (`owner_client_id`) REFERENCES `clients` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `documents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL,
  `idempotency_key` VARCHAR(255) NULL,
  `initiated_by` BIGINT NULL,
  `bank_date` DATE NOT NULL,
  `reverses_id` BIGINT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_documents_initiated_by` FOREIGN KEY (`initiated_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_documents_reverses_id` FOREIGN KEY (`reverses_id`) REFERENCES `documents` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `postings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `debit_account_id` BIGINT NOT NULL,
  `credit_account_id` BIGINT NOT NULL,
  `amount` BIGINT NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `bank_date` DATE NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_postings_document_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`),
  CONSTRAINT `fk_postings_debit_account_id` FOREIGN KEY (`debit_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_postings_credit_account_id` FOREIGN KEY (`credit_account_id`) REFERENCES `accounts` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `transfer_intents` (
  `id` CHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `kind` VARCHAR(255) NOT NULL,
  `from_account_id` BIGINT NOT NULL,
  `to_account_id` BIGINT NOT NULL,
  `amount` BIGINT NOT NULL,
  `amount_byn` BIGINT NOT NULL,
  `fee` BIGINT NOT NULL,
  `document_id` BIGINT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_transfer_intents_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_transfer_intents_from_account_id` FOREIGN KEY (`from_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_transfer_intents_to_account_id` FOREIGN KEY (`to_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_transfer_intents_document_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `deposit_products` (
  `id` SMALLINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `term_months` SMALLINT NOT NULL,
  `rate_percent` DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB;

CREATE TABLE `deposits` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `product_id` SMALLINT NOT NULL,
  `account_id` BIGINT NOT NULL,
  `payout_account_id` BIGINT NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `amount` BIGINT NOT NULL,
  `rate_percent` DECIMAL(5,2) NOT NULL,
  `demand_rate_percent` DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_deposits_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_deposits_product_id` FOREIGN KEY (`product_id`) REFERENCES `deposit_products` (`id`),
  CONSTRAINT `fk_deposits_account_id` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_deposits_payout_account_id` FOREIGN KEY (`payout_account_id`) REFERENCES `accounts` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `loan_products` (
  `id` SMALLINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `rate_percent` DECIMAL(5,2) NOT NULL,
  `min_amount` BIGINT NOT NULL,
  `max_amount` BIGINT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB;

CREATE TABLE `loan_applications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `product_id` SMALLINT NOT NULL,
  `target_account_id` BIGINT NOT NULL,
  `amount` BIGINT NOT NULL,
  `term_months` SMALLINT NOT NULL,
  `schedule_type` VARCHAR(255) NOT NULL,
  `rate_percent` DECIMAL(5,2) NOT NULL,
  `decided_by` BIGINT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_loan_applications_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_loan_applications_product_id` FOREIGN KEY (`product_id`) REFERENCES `loan_products` (`id`),
  CONSTRAINT `fk_loan_applications_target_account_id` FOREIGN KEY (`target_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_loan_applications_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `loans` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT NOT NULL,
  `client_id` BIGINT NOT NULL,
  `account_id` BIGINT NOT NULL,
  `payout_account_id` BIGINT NOT NULL,
  `amount` BIGINT NOT NULL,
  `rate_percent` DECIMAL(5,2) NOT NULL,
  `term_months` SMALLINT NOT NULL,
  `schedule_type` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_loans_application_id` FOREIGN KEY (`application_id`) REFERENCES `loan_applications` (`id`),
  CONSTRAINT `fk_loans_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_loans_account_id` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_loans_payout_account_id` FOREIGN KEY (`payout_account_id`) REFERENCES `accounts` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `cards` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `account_id` BIGINT NOT NULL,
  `system` VARCHAR(255) NOT NULL,
  `number_enc` VARCHAR(255) NOT NULL,
  `number_hash` VARCHAR(255) NOT NULL,
  `last4` CHAR(4) NOT NULL,
  `replaced_by` BIGINT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cards_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_cards_account_id` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_cards_replaced_by` FOREIGN KEY (`replaced_by`) REFERENCES `cards` (`id`)
) ENGINE = InnoDB;

CREATE TABLE `payments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `provider_id` INT NOT NULL,
  `from_account_id` BIGINT NOT NULL,
  `amount` BIGINT NOT NULL,
  `fee` BIGINT NOT NULL,
  `requisite` VARCHAR(255) NOT NULL,
  `document_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_payments_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_payments_from_account_id` FOREIGN KEY (`from_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_payments_document_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE = InnoDB;
