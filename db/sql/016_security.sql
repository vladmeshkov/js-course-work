-- Двухфакторная аутентификация (TOTP) и уведомления

ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL;     -- последний использованный временной интервал (защита от повторного ввода кода)
ALTER TABLE users ADD CONSTRAINT totp_secret_required CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

CREATE TABLE recovery_codes (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  code_hash  VARCHAR(100) NOT NULL,
  used_at    DATETIME(3) NULL,
  UNIQUE (user_id, code_hash),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  type        VARCHAR(30) NOT NULL,                    -- вид события: transfer, loan, deposit, card, security ...
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(1000) NOT NULL DEFAULT '',
  link        VARCHAR(200) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at     DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id, read_at);

-- напоминание о платеже по кредиту отправляется один раз
ALTER TABLE loan_schedule ADD COLUMN reminded BOOLEAN NOT NULL DEFAULT FALSE;
