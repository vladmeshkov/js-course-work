-- Начальные данные: роли, права, валюты, настройки

INSERT INTO roles (code, name) VALUES
  ('client',        'Клиент'),
  ('operator',      'Операционист'),
  ('credit_officer','Кредитный специалист'),
  ('monitoring',    'Специалист по финансовому мониторингу'),
  ('admin',         'Администратор');

INSERT INTO permissions (code, description) VALUES
  ('own.accounts',     'Работа со своими счетами и картами'),
  ('own.transfers',    'Переводы и платежи со своих счетов'),
  ('own.deposits',     'Вклады клиента'),
  ('own.loans',        'Кредиты клиента'),
  ('kyc.review',       'Проверка заявок на подключение'),
  ('cash.operate',     'Взнос и выдача наличных'),
  ('account.freeze',   'Арест и блокировка счетов'),
  ('loan.review',      'Рассмотрение кредитных заявок'),
  ('fraud.review',     'Очередь антифрода'),
  ('rates.manage',     'Курсы и тарифы'),
  ('users.manage',     'Пользователи и роли'),
  ('audit.view',       'Журнал аудита'),
  ('eod.run',          'Закрытие операционного дня'),
  ('backup.manage',    'Резервное копирование');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r JOIN permissions p ON
  (r.code = 'client'         AND p.code IN ('own.accounts', 'own.transfers', 'own.deposits', 'own.loans'))
  OR (r.code = 'operator'    AND p.code IN ('kyc.review', 'cash.operate', 'account.freeze'))
  OR (r.code = 'credit_officer' AND p.code IN ('loan.review'))
  OR (r.code = 'monitoring'  AND p.code IN ('fraud.review'))
  OR (r.code = 'admin'       AND p.code IN ('rates.manage', 'users.manage', 'audit.view', 'eod.run', 'backup.manage'));

INSERT INTO currencies (code, numeric_code, name) VALUES
  ('BYN', '933', 'Белорусский рубль'),
  ('USD', '840', 'Доллар США'),
  ('EUR', '978', 'Евро'),
  ('RUB', '643', 'Российский рубль');

INSERT INTO rate_spreads (currency) VALUES ('USD'), ('EUR'), ('RUB');

INSERT INTO settings (key, value, description) VALUES
  ('transfer.daily_limit',       '500000', 'Суточный лимит переводов клиента, в копейках BYN'),
  ('transfer.otp_threshold',     '10000',  'Сумма перевода, с которой нужен код подтверждения, в копейках BYN'),
  ('transfer.fee_percent',       '0',      'Комиссия за перевод внутри банка, %'),
  ('loan.max_dti_percent',       '40',     'Максимальная долговая нагрузка, %'),
  ('loan.penalty_percent_day',   '0.1',    'Пеня за день просрочки, %');

INSERT INTO bank_state (bank_date) VALUES (CURRENT_DATE);
