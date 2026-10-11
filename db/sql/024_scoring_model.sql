-- Регрессионный скоринг: обученные модели логистической регрессии и результат оценки в заявке

CREATE TABLE scoring_models (
  id          serial PRIMARY KEY,
  version     integer NOT NULL UNIQUE,
  coefficients jsonb NOT NULL,                -- {mean, std, weights, bias} в порядке признаков из lib/regression.js
  metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- точность, AUC, KS на тестовой выборке
  samples     integer NOT NULL,
  active      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scoring_models_active_idx ON scoring_models (active) WHERE active;

ALTER TABLE loan_applications
  ADD COLUMN pd_percent    numeric(5, 2),     -- вероятность дефолта по модели, %
  ADD COLUMN model_version integer;

INSERT INTO settings (key, value, description) VALUES
  ('loan.scoring_regression', '1',  'Решение по заявке принимает регрессионная модель (1) или балльная карта (0)'),
  ('loan.pd_approve',         '8',   'Автоодобрение при вероятности дефолта не выше, %'),
  ('loan.pd_manual',          '30',  'Ручное рассмотрение при вероятности дефолта не выше, % (выше: отказ)');
