-- Роли, права и пользователи

CREATE TABLE roles (
  id          smallserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL
);

CREATE TABLE permissions (
  code        text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id         smallint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE users (
  id               bigserial PRIMARY KEY,
  login            text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9._-]{3,32}$'),
  password_hash    text NOT NULL,
  role_id          smallint NOT NULL REFERENCES roles (id),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  failed_attempts  integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Анкета клиента. Паспорт и идентификационный номер хранятся в зашифрованном виде (AES-256-GCM).
CREATE TABLE clients (
  id               bigserial PRIMARY KEY,
  user_id          bigint NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  last_name        text NOT NULL,
  first_name       text NOT NULL,
  patronymic       text,
  birth_date       date NOT NULL,
  phone            text NOT NULL CHECK (phone ~ '^\+375[0-9]{9}$'),
  email            text,
  id_number_enc    text NOT NULL,
  id_number_hash   text NOT NULL UNIQUE,
  passport_enc     text NOT NULL,
  kyc_status       text NOT NULL DEFAULT 'submitted'
                   CHECK (kyc_status IN ('submitted', 'in_review', 'verified', 'rejected')),
  kyc_comment      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Журнал аудита: только дописывается (запрет UPDATE и DELETE ниже).
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     bigint REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  result      text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  ip          text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);

CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Таблица % допускает только добавление записей', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Одноразовые коды подтверждения операций (OTP)
CREATE TABLE otp_codes (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id, purpose);

-- Таблица сессий для connect-pg-simple
CREATE TABLE session (
  sid     varchar NOT NULL PRIMARY KEY,
  sess    json NOT NULL,
  expire  timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);
