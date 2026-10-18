INSERT INTO loan_products (name, rate_percent, min_amount, max_amount, min_term, max_term) VALUES
  ('Потребительский «Талер»', 14.90, 50000, 5000000, 6, 60),
  ('Потребительский «Быстрый»', 17.50, 50000, 500000, 3, 24);

INSERT INTO settings (`key`, value, description) VALUES
  ('loan.auto_limit',       '500000', 'Автоматическое одобрение возможно до этой суммы кредита, копейки'),
  ('loan.score_approve',    '70',     'Балл, с которого кредит одобряется автоматически'),
  ('loan.score_manual',     '45',     'Балл, с которого заявка идёт на ручное рассмотрение (ниже: отказ)');
