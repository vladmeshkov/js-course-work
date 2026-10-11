-- Почта: очередь исходящих писем (transactional outbox) и согласие клиента на дублирование уведомлений

ALTER TABLE users ADD COLUMN notify_email boolean NOT NULL DEFAULT true;

CREATE TABLE mail_outbox (
  id          bigserial PRIMARY KEY,
  user_id     bigint REFERENCES users (id),
  to_email    text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts    smallint NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (id) WHERE status = 'pending';
