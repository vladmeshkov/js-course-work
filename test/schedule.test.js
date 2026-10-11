import { describe, it, expect } from 'vitest';
import { annuityPayment, buildSchedule, dueDatesFrom, rebuildAfterPrepayment } from '../src/lib/schedule.js';
import { scoreApplication } from '../src/lib/scoring.js';

const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

describe('график платежей', () => {
  it('аннуитет: платёж по формуле, долг гасится ровно в ноль', () => {
    // 10 000 BYN, 14,9 %, 12 месяцев: A = S·i / (1 − (1+i)^−n)
    const i = 14.9 / 1200;
    const expected = Math.round((1000000 * i) / (1 - Math.pow(1 + i, -12)));
    expect(annuityPayment(1000000, 14.9, 12)).toBe(expected);
    const rows = buildSchedule({ principal: 1000000, annualPercent: 14.9, type: 'annuity', dueDates: dueDatesFrom('2026-10-11', 12) });
    expect(rows).toHaveLength(12);
    expect(sum(rows, 'principal')).toBe(1000000);
    expect(rows[11].balanceAfter).toBe(0);
    expect(rows[0].total).toBe(expected);
    // платёж постоянный, кроме последнего (он закрывает остаток с погрешностью в копейки)
    expect(Math.abs(rows[11].total - expected)).toBeLessThan(20);
    expect(rows[0].interest).toBe(Math.round(1000000 * i));
    expect(rows[0].dueDate).toBe('2026-11-11');
  });

  it('дифференцированный: часть долга одинакова, проценты убывают', () => {
    const rows = buildSchedule({ principal: 1200000, annualPercent: 12, type: 'differentiated', dueDates: dueDatesFrom('2026-01-31', 6) });
    expect(rows[0].principal).toBe(200000);
    expect(rows[0].interest).toBe(12000);
    expect(rows[1].interest).toBe(10000);
    expect(rows[0].total).toBeGreaterThan(rows[5].total);
    expect(sum(rows, 'principal')).toBe(1200000);
    expect(rows[1].dueDate).toBe('2026-03-31');
    expect(rows[0].dueDate).toBe('2026-02-28');
  });

  it('нулевая ставка делит долг поровну', () => {
    const rows = buildSchedule({ principal: 1000, annualPercent: 0.0001, type: 'annuity', dueDates: dueDatesFrom('2026-01-01', 4) });
    expect(sum(rows, 'principal')).toBe(1000);
  });

  it('частичное досрочное погашение: срок сокращается при том же платеже', () => {
    const dates = dueDatesFrom('2026-01-10', 24);
    const A = annuityPayment(2000000, 15, 24);
    const rows = rebuildAfterPrepayment({ balance: 1000000, annualPercent: 15, type: 'annuity', mode: 'term', dueDates: dates, currentPayment: A, firstNo: 1 });
    expect(rows.length).toBeLessThan(24);
    expect(sum(rows, 'principal')).toBe(1000000);
    expect(rows[0].total).toBe(A);
  });

  it('частичное досрочное погашение: срок прежний, платёж меньше', () => {
    const dates = dueDatesFrom('2026-01-10', 24);
    const A = annuityPayment(2000000, 15, 24);
    const rows = rebuildAfterPrepayment({ balance: 1000000, annualPercent: 15, type: 'annuity', mode: 'payment', dueDates: dates, currentPayment: A, firstNo: 1 });
    expect(rows).toHaveLength(24);
    expect(rows[0].total).toBeLessThan(A);
    expect(sum(rows, 'principal')).toBe(1000000);
  });

  it('первый платёж может иметь неполный период процентов', () => {
    const rows = buildSchedule({ principal: 100000, annualPercent: 12, type: 'annuity', dueDates: dueDatesFrom('2026-01-10', 3), firstInterest: 123 });
    expect(rows[0].interest).toBe(123);
  });
});

describe('скоринг', () => {
  const limits = { maxDti: 40, autoLimit: 500000, approve: 70, manual: 45 };
  const base = { age: 30, income: 300000, obligations: 0, newPayment: 40000, experienceMonths: 48, dependents: 0, amount: 300000, limits };

  it('надёжный заёмщик с малой суммой одобряется автоматически', () => {
    const r = scoreApplication(base);
    expect(r.decision).toBe('approve');
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.dti).toBeCloseTo(13.33, 1);
  });
  it('крупная сумма идёт на ручное рассмотрение, даже при высоком балле', () => {
    expect(scoreApplication({ ...base, amount: 900000 }).decision).toBe('manual');
  });
  it('долговая нагрузка выше 40 % даёт отказ независимо от баллов', () => {
    const r = scoreApplication({ ...base, obligations: 100000, newPayment: 40000 });
    expect(r.dti).toBeGreaterThan(40);
    expect(r.decision).toBe('reject');
  });
  it('слабый профиль даёт отказ, средний ручное рассмотрение', () => {
    expect(scoreApplication({ ...base, age: 19, experienceMonths: 2, dependents: 3, newPayment: 110000, amount: 5000000 }).decision).toBe('reject');
    expect(scoreApplication({ ...base, experienceMonths: 8, dependents: 2, newPayment: 80000, amount: 1000000 }).decision).toBe('manual');
  });
  it('возвращает разбор по факторам', () => {
    const r = scoreApplication(base);
    expect(r.notes.map((n) => n.factor)).toContain('Долговая нагрузка');
    expect(r.notes.reduce((t, n) => t + n.points, 0)).toBe(r.score);
  });
});
