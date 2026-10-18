INSERT INTO external_banks (code, name, bic, active) VALUES
  ('DRZH', 'ДорожныйБанк', 'DRZHBY2X', true),
  ('MRKT', 'Рыночный банк', 'MRKTBY2X', true),
  ('ZKRT', 'Закрывшийся банк', 'ZKRTBY2X', false);

INSERT INTO settings (`key`, value, description) VALUES
  ('interbank.fee_percent', '0.5',    'Комиссия за перевод в другой банк, %'),
  ('interbank.min_fee',     '50',     'Минимальная комиссия за перевод в другой банк, копейки BYN'),
  ('interbank.max_amount',  '1000000','Максимальная сумма перевода в другой банк, копейки BYN');
