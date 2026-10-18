import { query, withTransaction } from '../db/pool.js';
import { ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as auditService from './auditService.js';
import * as ratesService from './ratesService.js';

/**
 * Тарифы и лимиты. В таблице settings все значения хранятся строкой, суммы в копейках.
 * Здесь описано, как показывать каждую настройку и как проверять новое значение.
 */
const META = {
  'security.require_2fa_staff': { group: 'Безопасность', label: 'Обязательная 2FA для сотрудников (1 да, 0 нет)', unit: '', max: 1 },
  'transfer.daily_limit': { group: 'Переводы', label: 'Суточный лимит переводов клиентам', unit: 'BYN', money: true },
  'transfer.otp_threshold': { group: 'Переводы', label: 'Сумма перевода, с которой нужен код', unit: 'BYN', money: true },
  'transfer.fee_percent': { group: 'Переводы', label: 'Комиссия за перевод клиенту банка', unit: '%', max: 20 },
  'interbank.fee_percent': { group: 'Межбанковские переводы', label: 'Комиссия за перевод в другой банк', unit: '%', max: 20 },
  'interbank.min_fee': { group: 'Межбанковские переводы', label: 'Минимальная комиссия', unit: 'BYN', money: true },
  'interbank.max_amount': { group: 'Межбанковские переводы', label: 'Максимальная сумма перевода', unit: 'BYN', money: true },
  'loan.max_dti_percent': { group: 'Кредиты', label: 'Максимальная долговая нагрузка', unit: '%', max: 100 },
  'loan.penalty_percent_day': { group: 'Кредиты', label: 'Пеня за день просрочки', unit: '%', max: 5 },
  'loan.auto_limit': { group: 'Кредиты', label: 'Автоодобрение возможно до суммы', unit: 'BYN', money: true },
  'loan.score_approve': { group: 'Кредиты', label: 'Балл для автоодобрения', unit: 'баллов', max: 100 },
  'loan.scoring_regression': { group: 'Кредиты', label: 'Скоринг регрессионной моделью (1 да, 0 балльная карта)', unit: '', max: 1 },
  'loan.pd_approve': { group: 'Кредиты', label: 'Автоодобрение при вероятности дефолта не выше', unit: '%', max: 100 },
  'loan.pd_manual': { group: 'Кредиты', label: 'Ручное рассмотрение при вероятности дефолта не выше', unit: '%', max: 100 },
  'loan.score_manual': { group: 'Кредиты', label: 'Балл для ручного рассмотрения', unit: 'баллов', max: 100 },
  'fraud.large_amount': { group: 'Антифрод', label: 'Крупная сумма перевода', unit: 'BYN', money: true },
  'fraud.new_recipient_amount': { group: 'Антифрод', label: 'Сумма перевода новому получателю', unit: 'BYN', money: true },
  'fraud.new_client_amount': { group: 'Антифрод', label: 'Сумма перевода новичка (первые 3 дня)', unit: 'BYN', money: true },
  'fraud.velocity_count': { group: 'Антифрод', label: 'Число переводов за период', unit: 'шт', max: 100 },
  'fraud.velocity_minutes': { group: 'Антифрод', label: 'Период проверки частоты', unit: 'мин', max: 1440 },
  'fraud.score_confirm': { group: 'Антифрод', label: 'Балл риска для кода подтверждения', unit: 'баллов', max: 200 },
  'fraud.score_review': { group: 'Антифрод', label: 'Балл риска для задержки перевода', unit: 'баллов', max: 200 },
  'fraud.special_control': { group: 'Антифрод', label: 'Порог особого контроля (Закон № 165-З)', unit: 'BYN', money: true }
};

/** Настройки для экрана: значение переведено в рубли, где нужно. */
export async function list() {
  const { rows } = await query('SELECT `key`, value FROM settings');
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const groups = new Map();
  for (const [key, meta] of Object.entries(META)) {
    if (!byKey.has(key)) continue;
    const raw = Number(byKey.get(key));
    const value = meta.money ? String(raw / 100).replace('.', ',') : String(raw).replace('.', ',');
    if (!groups.has(meta.group)) groups.set(meta.group, []);
    groups.get(meta.group).push({ key, label: meta.label, unit: meta.unit, value });
  }
  return [...groups].map(([name, items]) => ({ name, items }));
}

/**
 * Сохраняет изменённые настройки.
 * @param {number} userId
 * @param {Record<string,string>} values ключ -> введённое значение
 */
export async function update(userId, values) {
  const errors = {};
  const changes = [];
  for (const [key, meta] of Object.entries(META)) {
    if (!(key in values)) continue;
    const text = String(values[key]).trim();
    let stored;
    if (meta.money) {
      const minor = parseAmount(text);
      if (minor === null) errors[key] = 'Введите сумму, например 1500,00';
      else stored = String(minor);
    } else {
      const n = Number(text.replace(',', '.'));
      if (!text || Number.isNaN(n) || n < 0 || n > (meta.max ?? 1e9)) errors[key] = `Число от 0 до ${meta.max ?? 1e9}`;
      else stored = String(n);
    }
    if (stored !== undefined) changes.push({ key, stored });
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return withTransaction(async (db) => {
    let changed = 0;
    for (const { key, stored } of changes) {
      const { rows: [old] } = await db.query('SELECT value FROM settings WHERE `key` = ? FOR UPDATE', [key]);
      if (old && old.value !== stored) {
        await db.query('UPDATE settings SET value = ?, updated_at = UTC_TIMESTAMP(3) WHERE `key` = ?', [stored, key]);
        await auditService.log({ userId, action: 'settings.update', entity: 'setting', entityId: key, details: { from: old.value, to: stored } }, db);
        changed += 1;
      }
    }
    return changed;
  });
}

export async function spreads() {
  const { rows } = await query(
    `SELECT s.currency, s.buy_percent, s.sell_percent, r.rate, r.scale, r.rate_date
     FROM rate_spreads s LEFT JOIN LATERAL (SELECT * FROM exchange_rates e WHERE e.currency = s.currency ORDER BY rate_date DESC LIMIT 1) r ON true
     ORDER BY s.currency`);
  return rows.map((r) => ({ ...r, buy_percent: Number(r.buy_percent), sell_percent: Number(r.sell_percent), rate: r.rate === null ? null : Number(r.rate) }));
}

/** @param {Record<string,{buy:string, sell:string}>} values по валютам */
export async function updateSpreads(userId, values) {
  const errors = {};
  const parsed = [];
  for (const [currency, v] of Object.entries(values)) {
    const buy = Number(String(v.buy).replace(',', '.'));
    const sell = Number(String(v.sell).replace(',', '.'));
    if (Number.isNaN(buy) || buy < 0 || buy > 20) errors[`${currency}_buy`] = 'От 0 до 20 %';
    if (Number.isNaN(sell) || sell < 0 || sell > 20) errors[`${currency}_sell`] = 'От 0 до 20 %';
    parsed.push({ currency, buy, sell });
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  await withTransaction(async (db) => {
    for (const p of parsed) {
      const { rowCount } = await db.query('UPDATE rate_spreads SET buy_percent = ?, sell_percent = ? WHERE currency = ?', [p.buy, p.sell, p.currency]);
      if (rowCount) await auditService.log({ userId, action: 'rates.spread', entity: 'currency', entityId: p.currency, details: { buy: p.buy, sell: p.sell } }, db);
    }
  });
}

export async function refreshFromNbrb(userId) {
  const source = await ratesService.refreshRates();
  await auditService.log({ userId, action: 'rates.refresh', details: { source } });
  return source;
}
