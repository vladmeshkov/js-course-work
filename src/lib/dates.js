/** Работа с датами вида «ГГГГ-ММ-ДД» без часовых поясов. */

function parse(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d) {
  return d.toISOString().slice(0, 10);
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** Число дней между датами (to минус from). */
export function daysBetween(from, to) {
  return Math.round((parse(to) - parse(from)) / 86400000);
}

export function addDays(date, days) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Прибавляет месяцы; если в нужном месяце нет такого числа, берётся последний день месяца. */
export function addMonths(date, months) {
  const d = parse(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return format(d);
}

/** Разбивает период [from, to) по календарным годам: [{year, days}]. */
export function splitByYear(from, to) {
  const parts = [];
  let cursor = from;
  while (cursor < to) {
    const year = Number(cursor.slice(0, 4));
    const yearEnd = `${year + 1}-01-01`;
    const end = to < yearEnd ? to : yearEnd;
    parts.push({ year, days: daysBetween(cursor, end) });
    cursor = end;
  }
  return parts;
}
