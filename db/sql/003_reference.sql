-- Справочники: курсы, тарифы и лимиты

-- Курс Нацбанка. rate: сколько BYN за scale единиц валюты.
CREATE TABLE exchange_rates (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  currency   CHAR(3) NOT NULL,
  rate_date  DATE NOT NULL,
  rate       DECIMAL(14, 4) NOT NULL,
  scale      INT NOT NULL DEFAULT 1,
  UNIQUE (currency, rate_date),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT exchange_rates_rate_check CHECK (rate > 0),
  CONSTRAINT exchange_rates_scale_check CHECK (scale > 0)
);

-- Спред банка к курсу Нацбанка, в процентах. Задаёт администратор.
CREATE TABLE rate_spreads (
  currency      CHAR(3) NOT NULL PRIMARY KEY,
  buy_percent   DECIMAL(5, 2) NOT NULL DEFAULT 1.50,
  sell_percent  DECIMAL(5, 2) NOT NULL DEFAULT 1.50,
  FOREIGN KEY (currency) REFERENCES currencies (code),
  CONSTRAINT rate_spreads_buy_check CHECK (buy_percent >= 0),
  CONSTRAINT rate_spreads_sell_check CHECK (sell_percent >= 0)
);

-- Тарифы и лимиты: пары «код, значение», изменяются в админке
CREATE TABLE settings (
  `key`        VARCHAR(60) NOT NULL PRIMARY KEY,
  value        VARCHAR(500) NOT NULL,
  description  VARCHAR(300) NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
