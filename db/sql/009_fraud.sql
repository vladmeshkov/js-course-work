-- Антифрод: случаи подозрительных операций и холды для задержанных переводов

ALTER TABLE transfer_intents DROP CHECK transfer_intents_status_check;
ALTER TABLE transfer_intents ADD CONSTRAINT transfer_intents_status_check
  CHECK (status IN ('new', 'review', 'confirmed', 'cancelled', 'expired', 'rejected'));

ALTER TABLE holds ADD COLUMN intent_id CHAR(36) NULL;
ALTER TABLE holds ADD CONSTRAINT holds_intent_fk FOREIGN KEY (intent_id) REFERENCES transfer_intents (id);

CREATE TABLE fraud_cases (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  intent_id        CHAR(36) NOT NULL,
  user_id          BIGINT NOT NULL,
  score            SMALLINT NOT NULL,
  reasons          JSON NOT NULL DEFAULT (JSON_ARRAY()),
  decision         VARCHAR(10) NOT NULL,
  status           VARCHAR(10) NOT NULL,
  special_control  BOOLEAN NOT NULL DEFAULT FALSE,   -- операция особого контроля (Закон № 165-З)
  amount_byn       BIGINT NOT NULL,
  reviewed_by      BIGINT NULL,
  reviewed_at      DATETIME(3) NULL,
  comment          TEXT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (intent_id) REFERENCES transfer_intents (id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (reviewed_by) REFERENCES users (id),
  CONSTRAINT fraud_cases_decision_check CHECK (decision IN ('confirm', 'review', 'special')),
  CONSTRAINT fraud_cases_status_check CHECK (status IN ('open', 'auto', 'approved', 'rejected'))
);
CREATE INDEX fraud_cases_status_idx ON fraud_cases (status, id);
