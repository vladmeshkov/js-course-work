import { pool } from '../db/pool.js';
import { roundMinor } from '../lib/money.js';
import { BusinessError } from '../lib/errors.js';

const FOREIGN = ['USD', 'EUR', 'RUB', 'CNY'];

// Курсы по умолчанию, если API Нацбанка недоступен (учебные значения)
const FALLBACK = { USD: { rate: 3.275, scale: 1 }, EUR: { rate: 3.812, scale: 1 }, RUB: { rate: 3.59, scale: 100 }, CNY: { rate: 4.6, scale: 10 } };

/**
 * Загружает официальные курсы с api.nbrb.by. Если API недоступен, записывает запасные значения.
 * @param {typeof fetch} [fetchFn] можно подменить в тестах
 * @returns {Promise<'nbrb' | 'fallback'>}
 */
export async function refreshRates(fetchFn = fetch) {
  let rates = null;
  let source = 'fallback';
  try {
    const response = await fetchFn('https://api.nbrb.by/exrates/rates?periodicity=0', { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const list = await response.json();
      const found = {};
      for (const item of list) {
        if (FOREIGN.includes(item.Cur_Abbreviation)) {
          found[item.Cur_Abbreviation] = { rate: item.Cur_OfficialRate, scale: item.Cur_Scale };
        }
      }
      if (FOREIGN.every((c) => found[c])) {
        rates = found;
        source = 'nbrb';
      }
    }
  } catch {
    // сеть недоступна: используем запасные значения
  }
  const used = rates ?? FALLBACK;
  for (const currency of FOREIGN) {
    await pool.query(
      `INSERT INTO exchange_rates (currency, rate_date, rate, scale)
       VALUES ($1, (SELECT bank_date FROM bank_state), $2, $3)
       ON CONFLICT (currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, scale = EXCLUDED.scale`,
      [currency, used[currency].rate, used[currency].scale]
    );
  }
  return source;
}

/**
 * Последние курсы Нацбанка и спреды банка.
 * @returns {Promise<Map<string, {perUnit:number, buyPercent:number, sellPercent:number}>>} BYN за единицу валюты
 */
export async function currentRates(db = pool) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (r.currency) r.currency, r.rate, r.scale, s.buy_percent, s.sell_percent
     FROM exchange_rates r JOIN rate_spreads s ON s.currency = r.currency
     ORDER BY r.currency, r.rate_date DESC`
  );
  const map = new Map([['BYN', { perUnit: 1, buyPercent: 0, sellPercent: 0 }]]);
  for (const r of rows) {
    map.set(r.currency, { perUnit: Number(r.rate) / r.scale, buyPercent: Number(r.buy_percent), sellPercent: Number(r.sell_percent) });
  }
  return map;
}

function need(rates, currency) {
  const entry = rates.get(currency);
  if (!entry) throw new BusinessError(`Нет курса для валюты ${currency}`);
  return entry;
}

/**
 * Эквивалент суммы в BYN по официальному курсу (без спреда). Используется для лимитов.
 * @param {number} amount копейки
 */
export async function toBynOfficial(currency, amount, db = pool) {
  const rates = await currentRates(db);
  return roundMinor(amount * need(rates, currency).perUnit);
}

/**
 * Конвертация по курсам банка: клиент продаёт валюту по курсу покупки, покупает по курсу продажи.
 * Курс банка = курс Нацбанка со спредом. Округление один раз, в конце.
 * @param {{from:string, to:string, amount:number}} p amount в копейках валюты from
 * @returns {Promise<number>} копейки валюты to
 */
export async function convert({ from, to, amount }, db = pool) {
  if (from === to) return amount;
  const rates = await currentRates(db);
  const source = need(rates, from);
  const target = need(rates, to);
  const byn = amount * source.perUnit * (1 - source.buyPercent / 100);
  return roundMinor(byn / (target.perUnit * (1 + target.sellPercent / 100)));
}
