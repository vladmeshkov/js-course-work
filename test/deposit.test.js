import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import { addMonths, addDays } from '../src/lib/dates.js';
import { interestForPeriod } from '../src/lib/interest.js';
import { openDeposit, processDeposits, closeEarly, earlyCloseQuote, projectIncome } from '../src/services/depositService.js';
import { closeDay } from '../src/services/eodService.js';
import { trialBalance } from '../src/services/ledgerService.js';
import { createClientWithAccount, addAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const productId = async (name) => (await pool.query('SELECT id FROM deposit_products WHERE name = $1', [name])).rows[0].id;
const today = async () => (await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date;
const run = (date) => withTransaction((db) => processDeposits(db, date));

describe('даты и проценты', () => {
  it('прибавляет месяцы с обрезкой по длине месяца', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('считает проценты по дням года, учитывая високосный', () => {
    expect(interestForPeriod(100000, 10, '2025-01-01', '2026-01-01')).toBe(10000);
    expect(interestForPeriod(100000, 10, '2024-01-01', '2025-01-01')).toBe(10000);
    expect(interestForPeriod(36500, 10, '2025-03-01', '2025-03-11')).toBe(100);
    // период через границу високосного года считается по частям
    expect(interestForPeriod(36500, 10, '2024-12-01', '2025-01-11')).toBe(Math.round((36500 * 10 * 31) / 100 / 366 + (36500 * 10 * 10) / 100 / 365));
  });
  it('прогноз дохода: капитализация даёт больше простых процентов', () => {
    const base = { amount: 100000, ratePercent: 12, termMonths: 12, openedDate: '2026-01-10' };
    const cap = projectIncome({ ...base, capitalization: true });
    const simple = projectIncome({ ...base, capitalization: false });
    expect(cap.total).toBeGreaterThan(simple.total);
    expect(simple.total).toBeGreaterThan(11000);
  });
});

describe('вклады', () => {
  it('открывает вклад: деньги переходят на отдельный счёт вклада', async () => {
    const c = await createClientWithAccount(500000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 12'), sourceAccountId: c.accountId, amount: 200000 });
    expect((await getAccount(c.accountId)).balance).toBe(300000);
    expect((await getAccount(dep.account_id)).balance).toBe(200000);
    expect(dep.status).toBe('active');
    expect(dep.maturity_date).toBe(addMonths(dep.opened_date, 12));
  });

  it('проверяет минимальную сумму, валюту счёта и остаток', async () => {
    const c = await createClientWithAccount(50000);
    const p = await productId('Талер 12');
    await expect(openDeposit(c.userId, { productId: p, sourceAccountId: c.accountId, amount: 500 })).rejects.toMatchObject({ fields: { amount: expect.stringContaining('Минимальная') } });
    const usd = await addAccount(c.clientId, 'USD', 100000);
    await expect(openDeposit(c.userId, { productId: p, sourceAccountId: usd.id, amount: 20000 })).rejects.toMatchObject({ fields: { sourceAccountId: expect.stringContaining('BYN') } });
    await expect(openDeposit(c.userId, { productId: p, sourceAccountId: c.accountId, amount: 90000 })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('с капитализацией: проценты за месяц прибавляются к вкладу', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 12'), sourceAccountId: c.accountId, amount: 200000 });
    const first = addMonths(dep.opened_date, 1);
    await run(first);
    expect((await pool.query('SELECT periods_done FROM deposits WHERE id = $1', [dep.id])).rows[0].periods_done).toBe(1);
    const expected = interestForPeriod(200000, 11.5, dep.opened_date, first);
    expect((await getAccount(dep.account_id)).balance).toBe(200000 + expected);
    // повторный запуск за ту же дату ничего не делает
    await run(first);
    expect((await pool.query('SELECT periods_done FROM deposits WHERE id = $1', [dep.id])).rows[0].periods_done).toBe(1);
    // второй месяц считается уже с капитализированной базой
    const second = addMonths(dep.opened_date, 2);
    await run(second);
    const expected2 = interestForPeriod(200000 + expected, 11.5, first, second);
    expect((await getAccount(dep.account_id)).balance).toBe(200000 + expected + expected2);
  });

  it('по окончании срока возвращает вклад с процентами на текущий счёт и закрывает договор', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 6'), sourceAccountId: c.accountId, amount: 100000 });
    await run(dep.maturity_date);
    const { rows: [d] } = await pool.query('SELECT status, interest_total FROM deposits WHERE id = $1', [dep.id]);
    expect(d.status).toBe('closed');
    expect(d.interest_total).toBeGreaterThan(4000);
    expect((await getAccount(c.accountId)).balance).toBe(200000 + 100000 + d.interest_total);
    const deposit = await getAccount(dep.account_id);
    expect(deposit.balance).toBe(0);
    expect(deposit.status).toBe('closed');
  });

  it('без капитализации проценты каждый месяц выплачиваются на текущий счёт', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер Доход'), sourceAccountId: c.accountId, amount: 200000 });
    await run(addMonths(dep.opened_date, 1));
    const interest = interestForPeriod(200000, 10.4, dep.opened_date, addMonths(dep.opened_date, 1));
    expect((await getAccount(dep.account_id)).balance).toBe(200000);
    expect((await getAccount(c.accountId)).balance).toBe(100000 + interest);
  });

  it('досрочное закрытие пересчитывает по ставке до востребования и удерживает излишек', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 12'), sourceAccountId: c.accountId, amount: 200000 });
    await run(addMonths(dep.opened_date, 1));
    const paid = (await pool.query('SELECT interest_total FROM deposits WHERE id = $1', [dep.id])).rows[0].interest_total;
    expect(paid).toBeGreaterThan(0);

    const quote = await earlyCloseQuote(c.userId, dep.id);
    const result = await closeEarly(c.userId, dep.id);
    expect(result.payout).toBe(quote.payout);
    // клиент получил тело вклада плюс проценты по ставке до востребования, не больше
    const demand = interestForPeriod(200000, 0.1, dep.opened_date, await today());
    expect((await getAccount(c.accountId)).balance).toBe(100000 + 200000 + demand);
    const { rows: [d] } = await pool.query('SELECT status FROM deposits WHERE id = $1', [dep.id]);
    expect(d.status).toBe('early_closed');
    await expect(closeEarly(c.userId, dep.id)).rejects.toThrow(/уже закрыт/);
  });

  it('безотзывный вклад досрочно закрыть нельзя', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 24'), sourceAccountId: c.accountId, amount: 100000 });
    await expect(closeEarly(c.userId, dep.id)).rejects.toThrow(/безотзывный/);
  });

  it('чужой вклад закрыть нельзя', async () => {
    const a = await createClientWithAccount(300000);
    const b = await createClientWithAccount(0);
    const dep = await openDeposit(a.userId, { productId: await productId('Талер 12'), sourceAccountId: a.accountId, amount: 100000 });
    await expect(closeEarly(b.userId, dep.id)).rejects.toMatchObject({ status: 404 });
  });

  it('со счёта вклада нельзя переводить деньги', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 12'), sourceAccountId: c.accountId, amount: 100000 });
    const { createTransfer } = await import('../src/services/transferService.js');
    await expect(createTransfer(c.userId, { kind: 'own', fromAccountId: dep.account_id, toAccountId: c.accountId, amount: 100 }))
      .rejects.toMatchObject({ fields: { fromAccountId: expect.any(String) } });
  });

  it('закрытие операционного дня двигает дату и сохраняет двойную запись', async () => {
    const before = await today();
    const r = await closeDay(null);
    expect(r.date).toBe(addDays(before, 1));
    for (const row of await trialBalance(pool)) expect(row.ok).toBe(true);
  });
});
