-- Регрессионный скоринг: обученные модели логистической регрессии и результат оценки в заявке

CREATE TABLE scoring_models (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version       INT NOT NULL UNIQUE,
  coefficients  JSON NOT NULL,                              -- {mean, std, weights, bias} в порядке признаков из lib/regression.js
  metrics       JSON NOT NULL DEFAULT (JSON_OBJECT()),      -- точность, AUC, KS на тестовой выборке
  samples       INT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  -- активной может быть только одна модель: у остальных active_flag = NULL, а NULL в уникальном индексе допускаются
  active_flag   TINYINT GENERATED ALWAYS AS (IF(active, 1, NULL)) STORED,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (active_flag)
);

ALTER TABLE loan_applications
  ADD COLUMN pd_percent    DECIMAL(5, 2) NULL,     -- вероятность дефолта по модели, %
  ADD COLUMN model_version INT NULL;

INSERT INTO settings (`key`, value, description) VALUES
  ('loan.scoring_regression', '1',  'Решение по заявке принимает регрессионная модель (1) или балльная карта (0)'),
  ('loan.pd_approve',         '8',   'Автоодобрение при вероятности дефолта не выше, %'),
  ('loan.pd_manual',          '30',  'Ручное рассмотрение при вероятности дефолта не выше, % (выше: отказ)');
