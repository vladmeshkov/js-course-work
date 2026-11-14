import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../../server/db/pool.js';
import { addMonths, addDays } from '../../server/shared/dates.js';
import { interestForPeriod } from '../../server/shared/interest.js';
import { openDeposit, processDeposits, closeEarly, earlyCloseQuote, projectIncome } from '../../server/modules/deposits/deposit.service.js';
import { closeDay } from '../../server/modules/admin/eod.service.js';
import { trialBalance } from '../../server/modules/ledger/ledger.service.js';
import { createClientWithAccount, addAccount, getAccount, closePool } from '../helpers.js';

afterAll(closePool);

const productId = async (name) => (await pool.query('SELECT id FROM deposit_products WHERE name = ?', [name])).rows[0].id;
const today = async () => (await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date;
const run = (date) => withTransaction((db) => processDeposits(db, date));

describe('даты и проценты', () => {
  it('считает проценты по дням года, учитывая високосный', () => {
    expect(interestForPeriod(100000, 10, '2025-01-01', '2026-01-01')).toBe(10000);
    expect(interestForPeriod(100000, 10, '2024-01-01', '2025-01-01')).toBe(10000);
    expect(interestForPeriod(36500, 10, '2025-03-01', '2025-03-11')).toBe(100);
    // период через границу високосного года считается по частям
    expect(interestForPeriod(36500, 10, '2024-12-01', '2025-01-11')).toBe(Math.round((36500 * 10 * 31) / 100 / 366 + (36500 * 10 * 10) / 100 / 365));
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

  it('досрочное закрытие пересчитывает по ставке до востребования и удерживает излишек', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 12'), sourceAccountId: c.accountId, amount: 200000 });
    await run(addMonths(dep.opened_date, 1));
    const paid = (await pool.query('SELECT interest_total FROM deposits WHERE id = ?', [dep.id])).rows[0].interest_total;
    expect(paid).toBeGreaterThan(0);

    const quote = await earlyCloseQuote(c.userId, dep.id);
    const result = await closeEarly(c.userId, dep.id);
    expect(result.payout).toBe(quote.payout);
    // клиент получил тело вклада плюс проценты по ставке до востребования, не больше
    const demand = interestForPeriod(200000, 0.1, dep.opened_date, await today());
    expect((await getAccount(c.accountId)).balance).toBe(100000 + 200000 + demand);
    const { rows: [d] } = await pool.query('SELECT status FROM deposits WHERE id = ?', [dep.id]);
    expect(d.status).toBe('early_closed');
    await expect(closeEarly(c.userId, dep.id)).rejects.toThrow(/уже закрыт/);
  });

  it('безотзывный вклад досрочно закрыть нельзя', async () => {
    const c = await createClientWithAccount(300000);
    const dep = await openDeposit(c.userId, { productId: await productId('Талер 24'), sourceAccountId: c.accountId, amount: 100000 });
    await expect(closeEarly(c.userId, dep.id)).rejects.toThrow(/безотзывный/);
  });

});
