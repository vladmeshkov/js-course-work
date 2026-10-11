-- Антифрод для переводов в другие банки: риск считается при оформлении, задержанный платёж ждёт специалиста

ALTER TABLE interbank_transfers DROP CONSTRAINT interbank_transfers_status_check;
ALTER TABLE interbank_transfers ADD CONSTRAINT interbank_transfers_status_check
  CHECK (status IN ('pending_otp', 'review', 'queued', 'sent', 'rejected', 'cancelled'));

ALTER TABLE interbank_transfers
  ADD COLUMN risk_score    smallint NOT NULL DEFAULT 0,
  ADD COLUMN risk_reasons  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN risk_decision text NOT NULL DEFAULT 'allow' CHECK (risk_decision IN ('allow', 'confirm', 'review')),
  ADD COLUMN risk_special  boolean NOT NULL DEFAULT false;

-- Случай антифрода относится либо к переводу клиенту банка, либо к переводу в другой банк
ALTER TABLE fraud_cases ALTER COLUMN intent_id DROP NOT NULL;
ALTER TABLE fraud_cases ADD COLUMN interbank_id bigint REFERENCES interbank_transfers (id);
ALTER TABLE fraud_cases ADD CONSTRAINT fraud_cases_target_check CHECK ((intent_id IS NOT NULL) <> (interbank_id IS NOT NULL));
