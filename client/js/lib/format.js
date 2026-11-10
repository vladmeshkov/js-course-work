// Форматирование денег, счетов и дат. Деньги хранятся в копейках, как на сервере (server/shared/money.js).

/** Значение «нет данных» в таблицах и итогах. */
export const EMPTY = '–';

/** Разбирает «1 234,56» в копейки; null, если это не сумма. */
export function parseAmount(text) {
  const clean = String(text ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Копейки в «1 234,56». */
export function formatAmount(minor) {
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${whole},${String(abs % 100).padStart(2, '0')}`;
}

/** IBAN группами по четыре символа. */
export function formatIban(iban) {
  return String(iban ?? '').replace(/(.{4})/g, '$1 ').trim();
}

/** «ГГГГ-ММ-ДД» (или ISO-время) в «ДД.ММ.ГГГГ». */
export function dmy(date) {
  return String(date ?? '').slice(0, 10).split('-').reverse().join('.');
}

/**
 * Дата и время по Минску: «18.10.2026 14:05» (с seconds: «18.10.2026 14:05:09»).
 * Сервер хранит время в UTC, показывать его нужно по часовому поясу банка.
 */
export function dateTime(value, { seconds = false } = {}) {
  if (!value) return '';
  return new Date(value).toLocaleString('ru-RU', {
    timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {})
  }).replace(',', '');
}

/** Только дата по Минску из момента времени: «18.10.2026». */
export function dateOf(value) {
  return dateTime(value).slice(0, 10);
}

/** Процент с запятой: 12.5 -> «12,5». */
export function percent(value) {
  return String(Number(value)).replace('.', ',');
}
