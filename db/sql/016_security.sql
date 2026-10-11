-- Двухфакторная аутентификация (TOTP) и уведомления

ALTER TABLE users ADD COLUMN totp_secret_enc text;
ALTER TABLE users ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_last_step bigint;     -- последний использованный временной интервал (защита от повторного ввода кода)
ALTER TABLE users ADD CONSTRAINT totp_secret_required CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

CREATE TABLE recovery_codes (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  UNIQUE (user_id, code_hash)
);

CREATE TABLE notifications (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text NOT NULL,                    -- вид события: transfer, loan, deposit, card, security ...
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- напоминание о платеже по кредиту отправляется один раз
ALTER TABLE loan_schedule ADD COLUMN reminded boolean NOT NULL DEFAULT false;
