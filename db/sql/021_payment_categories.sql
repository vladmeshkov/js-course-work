-- Категории каталога платежей по макету: связь и интернет вместе, добавлена благотворительность
UPDATE payment_categories SET name = 'Жилищно-коммунальные услуги' WHERE name = 'Жильё и коммунальные услуги';
UPDATE payment_categories SET name = 'Связь и интернет', hint = 'Мобильная связь, интернет, телевидение' WHERE name = 'Связь';
UPDATE payment_providers SET category_id = (SELECT id FROM payment_categories WHERE name = 'Связь и интернет')
  WHERE category_id = (SELECT id FROM payment_categories WHERE name = 'Интернет и телевидение');
DELETE FROM payment_categories WHERE name = 'Интернет и телевидение';
UPDATE payment_categories SET sort = 3 WHERE name = 'Налоги и штрафы';
UPDATE payment_categories SET sort = 4 WHERE name = 'Образование';
UPDATE payment_categories SET sort = 5 WHERE name = 'Транспорт';
INSERT INTO payment_categories (name, hint, sort) VALUES ('Благотворительность', 'Фонды помощи детям и животным', 6);
INSERT INTO payment_providers (category_id, name, city, requisite_label, requisite_regex, requisite_hint, min_amount, max_amount, fee_percent) VALUES
  ((SELECT id FROM payment_categories WHERE name = 'Благотворительность'), 'Фонд помощи детям', NULL, 'Номер пожертвования', '^\\d{4,10}$', '4-10 цифр, например 7001', 100, 500000, 0),
  ((SELECT id FROM payment_categories WHERE name = 'Благотворительность'), 'Приют для животных', NULL, 'Номер пожертвования', '^\\d{4,10}$', '4-10 цифр, например 7002', 100, 500000, 0);
