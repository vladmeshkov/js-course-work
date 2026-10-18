-- Роли, права и пользователи (MySQL 8)

CREATE TABLE roles (
  id    SMALLINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(30) NOT NULL UNIQUE,
  name  VARCHAR(100) NOT NULL
);

CREATE TABLE permissions (
  code         VARCHAR(40) NOT NULL PRIMARY KEY,
  description  VARCHAR(200) NOT NULL
);

CREATE TABLE role_permissions (
  role_id          SMALLINT NOT NULL,
  permission_code  VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES permissions (code) ON DELETE CASCADE
);

CREATE TABLE users (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  login            VARCHAR(32) NOT NULL UNIQUE,
  password_hash    VARCHAR(100) NOT NULL,
  role_id          SMALLINT NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     DATETIME(3) NULL,
  last_login_at    DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT users_login_check CHECK (REGEXP_LIKE(login, '^[a-z0-9._-]{3,32}$', 'c')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'blocked')),
  CONSTRAINT users_attempts_check CHECK (failed_attempts >= 0)
);

-- Анкета клиента. Паспорт и идентификационный номер хранятся в зашифрованном виде (AES-256-GCM).
CREATE TABLE clients (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT NOT NULL UNIQUE,
  last_name        VARCHAR(100) NOT NULL,
  first_name       VARCHAR(100) NOT NULL,
  patronymic       VARCHAR(100) NULL,
  birth_date       DATE NOT NULL,
  phone            VARCHAR(13) NOT NULL,
  email            VARCHAR(254) NULL,
  id_number_enc    TEXT NOT NULL,
  id_number_hash   VARCHAR(64) NOT NULL UNIQUE,
  passport_enc     TEXT NOT NULL,
  kyc_status       VARCHAR(12) NOT NULL DEFAULT 'submitted',
  kyc_comment      TEXT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT clients_phone_check CHECK (REGEXP_LIKE(phone, '^\\+375[0-9]{9}$')),
  CONSTRAINT clients_kyc_check CHECK (kyc_status IN ('submitted', 'in_review', 'verified', 'rejected'))
);

-- Журнал аудита: только дописывается (запрет UPDATE и DELETE ниже).
CREATE TABLE audit_log (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id     BIGINT NULL,
  action      VARCHAR(60) NOT NULL,
  entity      VARCHAR(60) NULL,
  entity_id   VARCHAR(60) NULL,
  result      VARCHAR(10) NOT NULL DEFAULT 'success',
  ip          VARCHAR(64) NULL,
  details     JSON NOT NULL DEFAULT (JSON_OBJECT()),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT audit_log_result_check CHECK (result IN ('success', 'failure'))
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица audit_log допускает только добавление записей';
END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Таблица audit_log допускает только добавление записей';
END;

-- Одноразовые коды подтверждения операций (OTP)
CREATE TABLE otp_codes (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  purpose     VARCHAR(80) NOT NULL,
  code_hash   VARCHAR(100) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME(3) NOT NULL,
  used_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id, purpose);

-- Сессии пользователей (хранилище express-session)
CREATE TABLE sessions (
  sid         VARCHAR(128) NOT NULL PRIMARY KEY,
  sess        JSON NOT NULL,
  expires_at  DATETIME(3) NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
