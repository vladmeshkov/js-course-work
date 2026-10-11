-- Антифрод: случаи подозрительных операций и холды для задержанных переводов

ALTER TABLE transfer_intents DROP CONSTRAINT transfer_intents_status_check;
ALTER TABLE transfer_intents ADD CONSTRAINT transfer_intents_status_check
  CHECK (status IN ('new', 'review', 'confirmed', 'cancelled', 'expired', 'rejected'));

ALTER TABLE holds ADD COLUMN intent_id uuid REFERENCES transfer_intents (id);

CREATE TABLE fraud_cases (
  id               bigserial PRIMARY KEY,
  intent_id        uuid NOT NULL REFERENCES transfer_intents (id),
  user_id          bigint NOT NULL REFERENCES users (id),
  score            smallint NOT NULL,
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision         text NOT NULL CHECK (decision IN ('confirm', 'review', 'special')),
  status           text NOT NULL CHECK (status IN ('open', 'auto', 'approved', 'rejected')),
  special_control  boolean NOT NULL DEFAULT false,   -- операция особого контроля (Закон № 165-З)
  amount_byn       bigint NOT NULL,
  reviewed_by      bigint REFERENCES users (id),
  reviewed_at      timestamptz,
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_cases_status_idx ON fraud_cases (status, id);
