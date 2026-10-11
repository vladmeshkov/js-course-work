import { addMonths } from './dates.js';
import { roundMinor } from './money.js';

/*
 * Графики платежей. Проценты считаются по месячной ставке: годовая / 12 / 100.
 * Аннуитет: A = S · i / (1 − (1 + i)^(−n)).
 * Дифференцированный: платёж_k = S / n + остаток_k · i.
 * Округление до копейки в каждом периоде, последний платёж закрывает остаток.
 */

/** Месячная ставка в долях. */
export function monthlyRate(annualPercent) {
  return annualPercent / 12 / 100;
}

/** Аннуитетный платёж в копейках. */
export function annuityPayment(principal, annualPercent, months) {
  const i = monthlyRate(annualPercent);
  if (i === 0) return roundMinor(principal / months);
  return roundMinor((principal * i) / (1 - Math.pow(1 + i, -months)));
}

/**
 * @typedef {{no:number, dueDate:string, principal:number, interest:number, total:number, balanceAfter:number}} Installment
 */

/**
 * Строит график платежей.
 * @param {object} p
 * @param {number} p.principal остаток долга, копейки
 * @param {number} p.annualPercent годовая ставка, %
 * @param {'annuity'|'differentiated'} p.type
 * @param {string[]} p.dueDates даты платежей по порядку (определяют число платежей)
 * @param {number} [p.firstNo] номер первого платежа (по умолчанию 1)
 * @param {number} [p.firstInterest] проценты первого платежа, если период неполный
 * @param {number} [p.payment] аннуитетный платёж, если его нужно сохранить (иначе рассчитывается)
 * @returns {Installment[]}
 */
export function buildSchedule({ principal, annualPercent, type, dueDates, firstNo = 1, firstInterest, payment }) {
  const n = dueDates.length;
  const i = monthlyRate(annualPercent);
  const annuity = payment ?? annuityPayment(principal, annualPercent, n);
  const baseDiff = Math.floor(principal / n);
  let balance = principal;
  const rows = [];
  dueDates.forEach((dueDate, k) => {
    const isLast = k === n - 1;
    const interest = k === 0 && firstInterest !== undefined ? firstInterest : roundMinor(balance * i);
    let part;
    if (isLast) part = balance;
    else if (type === 'annuity') part = Math.min(balance, Math.max(0, annuity - interest));
    else part = baseDiff;
    balance -= part;
    rows.push({ no: firstNo + k, dueDate, principal: part, interest, total: part + interest, balanceAfter: balance });
  });
  return rows;
}

/** Даты платежей: через 1, 2, ... n месяцев от даты выдачи. */
export function dueDatesFrom(startDate, months) {
  return Array.from({ length: months }, (_, k) => addMonths(startDate, k + 1));
}

/**
 * Пересчёт графика после частичного досрочного погашения.
 * mode 'term': платёж остаётся прежним, срок сокращается.
 * mode 'payment': срок остаётся прежним, платёж уменьшается.
 * @param {object} p
 * @param {number} p.balance остаток долга после погашения
 * @param {number} p.annualPercent
 * @param {'annuity'|'differentiated'} p.type
 * @param {'term'|'payment'} p.mode
 * @param {string[]} p.dueDates оставшиеся даты платежей (до пересчёта)
 * @param {number} p.currentPayment текущий платёж: у аннуитета постоянный, у дифференцированного часть долга
 * @param {number} p.firstNo
 * @param {number} [p.firstInterest]
 */
export function rebuildAfterPrepayment({ balance, annualPercent, type, mode, dueDates, currentPayment, firstNo, firstInterest }) {
  const i = monthlyRate(annualPercent);
  let dates = dueDates;
  if (mode === 'term') {
    let n;
    if (type === 'annuity') {
      // платёж должен покрывать проценты: иначе долг не гасится
      const interestOnly = balance * i;
      n = currentPayment <= interestOnly ? dueDates.length : Math.ceil(-Math.log(1 - (balance * i) / currentPayment) / Math.log(1 + i) - 1e-9);
    } else {
      n = Math.ceil(balance / currentPayment);
    }
    dates = dueDates.slice(0, Math.max(1, Math.min(n, dueDates.length)));
  }
  return buildSchedule({
    principal: balance, annualPercent, type, dueDates: dates, firstNo, firstInterest,
    payment: mode === 'term' && type === 'annuity' ? currentPayment : undefined
  });
}
