import { roundMinor } from './money.js';
import { daysInYear, splitByYear } from './dates.js';

/**
 * Проценты за период [from, to): база × ставка / 100 / число дней в году (365 или 366).
 * Если период захватывает несколько лет, считаем по частям. Округляем один раз в конце.
 * @param {number} base копейки
 * @param {number} ratePercent годовая ставка, %
 * @param {string} from 'ГГГГ-ММ-ДД'
 * @param {string} to   'ГГГГ-ММ-ДД'
 */
export function interestForPeriod(base, ratePercent, from, to) {
  let sum = 0;
  for (const { year, days } of splitByYear(from, to)) {
    sum += (base * ratePercent * days) / 100 / daysInYear(year);
  }
  return roundMinor(sum);
}
