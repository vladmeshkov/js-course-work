-- Почта: очередь исходящих писем (transactional outbox) и согласие клиента на дублирование уведомлений

ALTER TABLE users ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE mail_outbox (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NULL,
  to_email    VARCHAR(254) NOT NULL,
  subject     VARCHAR(300) NOT NULL,
  body        TEXT NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending',
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at     DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT mail_outbox_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (status, id);
