-- Антифрод для переводов в другие банки: риск считается при оформлении, задержанный платёж ждёт специалиста

ALTER TABLE interbank_transfers DROP CHECK interbank_transfers_status_check;
ALTER TABLE interbank_transfers ADD CONSTRAINT interbank_transfers_status_check
  CHECK (status IN ('pending_otp', 'review', 'queued', 'sent', 'rejected', 'cancelled'));

ALTER TABLE interbank_transfers
  ADD COLUMN risk_score    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN risk_reasons  JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN risk_decision VARCHAR(10) NOT NULL DEFAULT 'allow',
  ADD COLUMN risk_special  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT interbank_risk_decision_check CHECK (risk_decision IN ('allow', 'confirm', 'review'));

-- Случай антифрода относится либо к переводу клиенту банка, либо к переводу в другой банк
ALTER TABLE fraud_cases MODIFY intent_id CHAR(36) NULL;
ALTER TABLE fraud_cases ADD COLUMN interbank_id BIGINT NULL;
ALTER TABLE fraud_cases ADD CONSTRAINT fraud_cases_interbank_fk FOREIGN KEY (interbank_id) REFERENCES interbank_transfers (id);
ALTER TABLE fraud_cases ADD CONSTRAINT fraud_cases_target_check CHECK ((intent_id IS NOT NULL) <> (interbank_id IS NOT NULL));
