/**
 * Деньги хранятся целым числом копеек (минимальных единиц валюты). Float не используется.
 */

/**
 * Разбирает строку «1 234,56» или «1234.5» в копейки.
 * @param {string} text
 * @returns {number | null} копейки или null, если строка не является суммой
 */
export function parseAmount(text) {
  const clean = String(text ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Форматирует копейки как «1 234,56».
 * @param {number} minor
 */
export function formatAmount(minor) {
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole},${frac}`;
}

/**
 * Единое правило округления для всей системы: до ближайшей копейки, половина вверх.
 * @param {number} value дробное значение в копейках
 */
export function roundMinor(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Процент от суммы в копейках.
 * @param {number} minor
 * @param {number} percent например 1.5
 */
export function percentOf(minor, percent) {
  return roundMinor((minor * percent) / 100);
}
