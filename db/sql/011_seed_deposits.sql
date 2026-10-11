INSERT INTO deposit_products (name, currency, term_months, rate_percent, demand_rate_percent, min_amount, capitalization, revocable) VALUES
  ('Талер 6',          'BYN', 6,  9.80,  0.10, 10000, true,  true),
  ('Талер 12',         'BYN', 12, 11.50, 0.10, 10000, true,  true),
  ('Талер 24',         'BYN', 24, 12.20, 0.10, 50000, true,  false),
  ('Талер Доход',      'BYN', 12, 10.40, 0.10, 100000, false, true),
  ('Талер Валютный',   'USD', 12, 3.20,  0.05, 10000, true,  true);
