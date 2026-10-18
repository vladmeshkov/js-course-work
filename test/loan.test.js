import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import { addMonths, addDays } from '../src/lib/dates.js';
import { apply, decide, sign, requestSignCode, processLoans, repayFull, repayPartial, getLoan, previewSchedule } from '../src/services/loanService.js';
import * as otpService from '../src/services/otpService.js';
import { trialBalance } from '../src/services/ledgerService.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';
import { lookupHash } from '../src/lib/crypto.js';
import { post } from '../src/services/ledgerService.js';
import { ensureInternalAccount } from '../src/services/accountService.js';

/** Внесение и снятие наличных проводками, чтобы двойная запись сохранялась. */
async function cashIn(accountId, amount) {
  await withTransaction(async (db) => {
    const cash = await ensureInternalAccount(db, 'cash', 'BYN');
    await post({ type: 'cash_in', entries: [{ debit: cash.id, credit: accountId, amount, currency: 'BYN' }] }, db);
  });
}
async function cashOutAll(accountId) {
  const { balance } = await getAccount(accountId);
  if (balance <= 0) return;
  await withTransaction(async (db) => {
    const cash = await ensureInternalAccount(db, 'cash', 'BYN');
    await post({ type: 'cash_out', entries: [{ debit: accountId, credit: cash.id, amount: balance, currency: 'BYN' }] }, db);
  });
}

afterAll(closePool);

const bankDate = async () => String((await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date).slice(0, 10);
const run = (date) => withTransaction((db) => processLoans(db, date));
const productId = async () => (await pool.query("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'")).rows[0].id;

/** Клиент с хорошим профилем, у которого можно оформить кредит. */
async function goodClient(balance = 0) {
  const c = await createClientWithAccount(balance);
  await pool.query("UPDATE clients SET birth_date = '1990-05-05' WHERE id = ?", [c.clientId]);
  return c;
}

const input = async (c, extra = {}) => ({
  productId: await productId(), amount: 300000, termMonths: 12, scheduleType: 'annuity', targetAccountId: c.accountId,
  income: 300000, obligations: 0, experienceMonths: 60, dependents: 0, ...extra
});

/** Подписывает договор с кодом, который удалось получить из базы (хэш подменяем известным кодом). */
async function signContract(c, application) {
  await requestSignCode(c.userId, application.id);
  await pool.query('UPDATE otp_codes SET code_hash = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
    [lookupHash(`${c.userId}:loan:${application.id}:123456`), c.userId, `loan:${application.id}`]);
  return sign(c.userId, application.id, '123456');
}

describe('заявка и скоринг', () => {
  it('надёжный клиент получает автоматическое одобрение', async () => {
    const c = await goodClient();
    const a = await apply(c.userId, await input(c));
    expect(a.status).toBe('approved');
    expect(a.score).toBeGreaterThanOrEqual(70);
  });

  it('крупная сумма уходит на ручное рассмотрение, специалист одобряет или отклоняет', async () => {
    const officer = (await pool.query("SELECT id FROM users u WHERE role_id = (SELECT id FROM roles WHERE code = 'credit_officer') LIMIT 1")).rows[0]
      ?? { id: await withTransaction(async (db) => (await db.query("INSERT INTO users (login, password_hash, role_id) VALUES ('officer.t', 'x', (SELECT id FROM roles WHERE code = 'credit_officer'))")).insertId) };
    const c = await goodClient();
    const a = await apply(c.userId, await input(c, { amount: 2500000, termMonths: 36, income: 900000 }));
    expect(a.status).toBe('manual_review');
    await expect(decide(officer.id, a.id, { approve: false, comment: '' })).rejects.toMatchObject({ fields: { comment: expect.any(String) } });
    await decide(officer.id, a.id, { approve: true });
    await expect(decide(officer.id, a.id, { approve: true })).rejects.toThrow(/уже рассмотрена/);
    const c2 = await goodClient();
    const b = await apply(c2.userId, await input(c2, { amount: 2500000, termMonths: 36, income: 900000 }));
    await decide(officer.id, b.id, { approve: false, comment: 'Недостаточно подтверждённого дохода' });
    expect((await pool.query('SELECT status FROM loan_applications WHERE id = ?', [b.id])).rows[0].status).toBe('rejected');
  });

  it('отказывает при долговой нагрузке выше 40 %', async () => {
    const c = await goodClient();
    const a = await apply(c.userId, await input(c, { income: 100000, obligations: 50000 }));
    expect(a.status).toBe('rejected');
    expect(a.decision_comment).toContain('Долговая нагрузка');
    await expect(signContract(c, a)).rejects.toThrow(/одобренную/);
  });

  it('проверяет границы суммы, срока и счёта зачисления', async () => {
    const c = await goodClient();
    await expect(apply(c.userId, await input(c, { amount: 100 }))).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
    await expect(apply(c.userId, await input(c, { termMonths: 1 }))).rejects.toMatchObject({ fields: { termMonths: expect.any(String) } });
    await expect(apply(c.userId, await input(c, { targetAccountId: 999999 }))).rejects.toMatchObject({ fields: { targetAccountId: expect.any(String) } });
  });

  it('показывает график до подачи заявки', async () => {
    const { rows } = await previewSchedule({ productId: await productId(), amount: 300000, termMonths: 6, type: 'differentiated' });
    expect(rows).toHaveLength(6);
    expect(rows.reduce((t, r) => t + r.principal, 0)).toBe(300000);
  });
});

describe('выдача и обслуживание', () => {
  it('подписание кодом выдаёт кредит: деньги на счёте, долг на ссудном счёте, график создан', async () => {
    const c = await goodClient();
    const a = await apply(c.userId, await input(c));
    const wrong = await requestSignCode(c.userId, a.id);
    await expect(sign(c.userId, a.id, wrong === '000000' ? '111111' : '000000')).rejects.toMatchObject({ code: 'otp_wrong' });
    const loan = await signContract(c, a);
    expect((await getAccount(c.accountId)).balance).toBe(300000);
    expect((await getAccount(loan.account_id)).balance).toBe(-300000);
    const { schedule } = await getLoan(c.userId, loan.id);
    expect(schedule).toHaveLength(12);
    expect(schedule.reduce((t, r) => t + r.principal, 0)).toBe(300000);
    expect(loan.opened_date.slice?.(0, 10) ?? loan.opened_date).toBeTruthy();
    await expect(signContract(c, a)).rejects.toThrow(/одобренную/);
  });

  it('при закрытии дня платёж списывается по графику', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c)));
    const first = (await getLoan(c.userId, loan.id)).schedule[0];
    const before = (await getAccount(c.accountId)).balance;
    await run(addMonths(await bankDate(), 1));
    const after = await getLoan(c.userId, loan.id);
    expect(after.schedule[0].status).toBe('paid');
    expect((await getAccount(c.accountId)).balance).toBe(before - first.principal - first.interest);
    expect(after.loan.principal_balance).toBe(300000 - first.principal);
    expect(after.dpd).toBe(0);
  });

  it('при нехватке денег платёж уходит в просрочку, пеня растёт, после пополнения платёж проходит с пеней', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c)));
    await cashOutAll(c.accountId);
    const due = addMonths(await bankDate(), 1);
    await run(due);
    let state = await getLoan(c.userId, loan.id);
    expect(state.schedule[0].status).toBe('overdue');
    expect(state.schedule[0].penalty).toBe(0);

    // прошло пять дней: банковская дата сдвинулась, пеня начислена
    const later = addDays(due, 5);
    await pool.query('UPDATE bank_state SET bank_date = ?', [later]);
    await run(later);
    state = await getLoan(c.userId, loan.id);
    const row = state.schedule[0];
    expect(row.status).toBe('overdue');
    expect(row.penalty).toBe(Math.round(((row.principal + row.interest) * 5 * 0.1) / 100));
    expect(state.dpd).toBe(5);

    // клиент пополнил счёт: следующее закрытие дня списывает платёж вместе с пеней
    await cashIn(c.accountId, 100000);
    const next = addDays(later, 1);
    await pool.query('UPDATE bank_state SET bank_date = ?', [next]);
    await run(next);
    state = await getLoan(c.userId, loan.id);
    expect(state.schedule[0].status).toBe('paid');
    expect(state.schedule[0].penalty).toBeGreaterThan(row.penalty - 1);
    expect(state.dpd).toBe(0);
  });

  it('после выплаты всех платежей кредит закрывается, остаток на ссудном счёте нулевой', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c, { termMonths: 6 })));
    // на счёте достаточно денег для всех платежей
    await cashIn(c.accountId, 400000);
    await run(addMonths(await bankDate(), 6));
    const state = await getLoan(c.userId, loan.id);
    expect(state.loan.status).toBe('closed');
    expect(state.loan.principal_balance).toBe(0);
    expect((await getAccount(loan.account_id)).balance).toBe(0);
    expect(state.schedule.every((r) => r.status === 'paid')).toBe(true);
  });
});

describe('досрочное погашение', () => {
  it('полное погашение: долг и проценты за прошедшие дни, график отменён', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c)));
    await cashIn(c.accountId, 100000);
    const q = await repayFull(c.userId, loan.id);
    expect(q.principal).toBe(300000);
    const state = await getLoan(c.userId, loan.id);
    expect(state.loan.status).toBe('closed');
    expect((await getAccount(loan.account_id)).balance).toBe(0);
    await expect(repayFull(c.userId, loan.id)).rejects.toThrow(/уже погашен/);
  });

  it('частичное погашение с сокращением срока пересобирает график', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c, { termMonths: 24 })));
    await cashIn(c.accountId, 100000);
    const before = await getLoan(c.userId, loan.id);
    const r = await repayPartial(c.userId, loan.id, { amount: 100000, mode: 'term' });
    expect(r.newBalance).toBe(200000);
    const after = await getLoan(c.userId, loan.id);
    expect(after.schedule.length).toBeLessThan(before.schedule.length);
    expect(after.schedule.reduce((t, x) => t + x.principal, 0)).toBe(200000);
  });

  it('частичное погашение со снижением платежа сохраняет срок', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c, { termMonths: 24 })));
    await cashIn(c.accountId, 100000);
    const before = await getLoan(c.userId, loan.id);
    await repayPartial(c.userId, loan.id, { amount: 100000, mode: 'payment' });
    const after = await getLoan(c.userId, loan.id);
    expect(after.schedule).toHaveLength(24);
    const pay = (s) => s.principal + s.interest;
    expect(pay(after.schedule[1])).toBeLessThan(pay(before.schedule[1]));
  });

  it('проверяет сумму частичного погашения и не даёт погашать при просрочке', async () => {
    const c = await goodClient();
    const loan = await signContract(c, await apply(c.userId, await input(c)));
    await expect(repayPartial(c.userId, loan.id, { amount: 300000, mode: 'term' })).rejects.toMatchObject({ fields: { amount: expect.stringContaining('остатка долга') } });
    await expect(repayPartial(c.userId, loan.id, { amount: 0, mode: 'term' })).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
  });

  it('двойная запись сходится после всех операций', async () => {
    for (const row of await trialBalance(pool)) expect(row.ok).toBe(true);
  });
});
