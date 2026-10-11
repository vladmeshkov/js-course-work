import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { register, hashPassword } from '../src/services/authService.js';
import * as kycService from '../src/services/kycService.js';
import { cashOperation } from '../src/services/cashService.js';
import { setFrozen, searchAccounts } from '../src/services/accountService.js';
import { createTransfer } from '../src/services/transferService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

async function operator() {
  const login = `op${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = await userModel.create(pool, { login, passwordHash: await hashPassword('Parol2026'), roleCode: 'operator' });
  return { id, login };
}

describe('операционист', () => {
  it('проверка анкеты: просмотр расшифровывает данные и пишется в журнал, подтверждение открывает счёт', async () => {
    const op = await operator();
    const n = Date.now() % 100000;
    const { clientId } = await register({
      login: `kyc${n}`, password: 'Parol2026', passwordRepeat: 'Parol2026', lastName: 'Сидоров', firstName: 'Пётр', birthDate: '1990-02-02',
      idNumber: `${String(1000000 + n).slice(0, 7)}A001PB1`, passport: 'MC1112223', phone: '+375291112244'
    });
    expect((await kycService.queue()).some((c) => c.id === clientId)).toBe(true);
    const view = await kycService.getForReview(clientId, op.id);
    expect(view.passport).toBe('MC1112223');
    const { rows } = await pool.query("SELECT 1 FROM audit_log WHERE action = 'kyc.view' AND user_id = $1", [op.id]);
    expect(rows).toHaveLength(1);
    const account = await kycService.verifyClient(clientId, op.id);
    expect(account.currency).toBe('BYN');
    await expect(kycService.verifyClient(clientId, op.id)).rejects.toThrow(/уже верифицирован/);
    expect((await kycService.queue()).some((c) => c.id === clientId)).toBe(false);
  });

  it('касса: взнос и выдача наличных, выдача не больше остатка', async () => {
    const op = await operator();
    const c = await createClientWithAccount(0);
    const iban = (await getAccount(c.accountId)).iban;
    await cashOperation(op.id, { iban, amount: 50000, direction: 'in' });
    expect((await getAccount(c.accountId)).balance).toBe(50000);
    await cashOperation(op.id, { iban, amount: 20000, direction: 'out' });
    expect((await getAccount(c.accountId)).balance).toBe(30000);
    await expect(cashOperation(op.id, { iban, amount: 99999, direction: 'out' })).rejects.toMatchObject({ code: 'insufficient_funds' });
    await expect(cashOperation(op.id, { iban: 'BY00', amount: 100, direction: 'in' })).rejects.toMatchObject({ fields: { iban: expect.any(String) } });
    await expect(cashOperation(op.id, { iban, amount: 0, direction: 'in' })).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
  });

  it('арест счёта запрещает списание, но не зачисление; нужно основание', async () => {
    const op = await operator();
    const a = await createClientWithAccount(50000);
    const b = await createClientWithAccount(50000);
    await expect(setFrozen(op.id, a.accountId, true, '')).rejects.toThrow(/основание/);
    await setFrozen(op.id, a.accountId, true, 'Решение суда № 12');
    await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: 100 })).rejects.toBeTruthy();
    const found = await searchAccounts((await getAccount(a.accountId)).iban);
    expect(found.some((x) => x.id === a.accountId && x.status === 'frozen')).toBe(true);
    await cashOperation(op.id, { iban: (await getAccount(a.accountId)).iban, amount: 1000, direction: 'in' });
    await expect(cashOperation(op.id, { iban: (await getAccount(a.accountId)).iban, amount: 1000, direction: 'out' })).rejects.toThrow(/заблокирован/);
    await setFrozen(op.id, a.accountId, false);
    await cashOperation(op.id, { iban: (await getAccount(a.accountId)).iban, amount: 1000, direction: 'out' });
  });

  it('страницы операциониста открываются, а клиенту недоступны', async () => {
    const op = await operator();
    const app = createApp();
    const agent = request.agent(app);
    const token = /name="_csrf" value="([0-9a-f]+)"/.exec((await agent.get('/login')).text)[1];
    await agent.post('/login').type('form').send({ _csrf: token, login: op.login, password: 'Parol2026' });
    for (const url of ['/staff/kyc', '/staff/cash', '/staff/accounts?q=client', '/workplace']) expect((await agent.get(url)).status, url).toBe(200);
    expect((await agent.get('/admin/users')).status).toBe(403);
    expect((await agent.get('/staff/loans')).status).toBe(403);
  });
});

describe('главная сотрудника', () => {
  it('показывает только разделы своей роли', async () => {
    const { forUser } = await import('../src/services/staffDashboardService.js');
    const op = await userModel.findById(await userModel.create(pool, { login: `dash${Date.now()}`, passwordHash: 'x', roleCode: 'operator' }));
    const o = await forUser(op);
    expect(o.metrics.map((m) => m.label)).toEqual(expect.arrayContaining(['Анкеты на проверке', 'Заблокированных счетов']));
    expect(o.metrics.map((m) => m.label)).not.toContain('Пользователей');
    expect(o.admin).toBeNull();
    const admin = await userModel.findById(await userModel.create(pool, { login: `dadm${Date.now()}`, passwordHash: 'x', roleCode: 'admin' }));
    const a = await forUser(admin);
    expect(a.metrics.map((m) => m.label)).toEqual(expect.arrayContaining(['Пользователей', 'Неудачных входов за сутки']));
    expect(a.admin.balanced).toBe(true);
    expect(a.queues).toHaveLength(0);
    const credit = await userModel.findById(await userModel.create(pool, { login: `dcr${Date.now()}`, passwordHash: 'x', roleCode: 'credit_officer' }));
    expect((await forUser(credit)).queues.map((q) => q.title)).toEqual(['Заявки на кредит']);
  });
});
