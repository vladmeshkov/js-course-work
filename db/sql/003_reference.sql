-- Справочники: курсы, тарифы и лимиты

-- Курс Нацбанка. rate: сколько BYN за scale единиц валюты.
CREATE TABLE exchange_rates (
  id          bigserial PRIMARY KEY,
  currency    char(3) NOT NULL REFERENCES currencies (code),
  rate_date   date NOT NULL,
  rate        numeric(14, 4) NOT NULL CHECK (rate > 0),
  scale       integer NOT NULL DEFAULT 1 CHECK (scale > 0),
  UNIQUE (currency, rate_date)
);

-- Спред банка к курсу Нацбанка, в процентах. Задаёт администратор.
CREATE TABLE rate_spreads (
  currency        char(3) PRIMARY KEY REFERENCES currencies (code),
  buy_percent     numeric(5, 2) NOT NULL DEFAULT 1.50 CHECK (buy_percent >= 0),
  sell_percent    numeric(5, 2) NOT NULL DEFAULT 1.50 CHECK (sell_percent >= 0)
);

-- Тарифы и лимиты: пары «код, значение», изменяются в админке
CREATE TABLE settings (
  key          text PRIMARY KEY,
  value        text NOT NULL,
  description  text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
