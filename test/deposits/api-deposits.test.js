import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { pool } from '../../server/db/pool.js';
import { hashPassword } from '../../server/modules/auth/auth.service.js';
import * as userModel from '../../server/modules/auth/user.model.js';
import { createClientWithAccount, getAccount, closePool } from '../helpers.js';
import { apiClient, loggedIn } from '../http.js';

afterAll(closePool);

const app = createApp();
const PASSWORD = 'Parol2026';

const loanProductId = async () => (await pool.query("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'")).rows[0].id;
const depositId = async (name) => (await pool.query('SELECT id FROM deposit_products WHERE name = ?', [name])).rows[0].id;

/** Клиент с проверенной анкетой, счётом и входом в систему. */
async function clientSession(balance = 500000) {
  const hash = await hashPassword(PASSWORD);
  const c = await createClientWithAccount(balance, 'BYN', hash);
  await pool.query("UPDATE clients SET birth_date = '1990-05-05' WHERE id = ?", [c.clientId]);
  return { ...c, api: await loggedIn(app, c.login, PASSWORD) };
}

/** Сотрудник с ролью (кредитный специалист или другая) и вход. */
async function staffSession(roleCode, login) {
  await userModel.create(pool, { login, passwordHash: await hashPassword(PASSWORD), roleCode });
  return loggedIn(app, login, PASSWORD);
}


describe('каталог и калькуляторы открыты гостю', () => {
  it('каталог вкладов: продукты есть, своих вкладов нет', async () => {
    const res = await request(app).get('/api/deposits');
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toEqual(expect.arrayContaining(['Талер 6', 'Талер 12', 'Талер 24']));
    expect(res.body.mine).toEqual([]);
  });

  it('каталог кредитов: продукты есть, своих кредитов и заявок нет', async () => {
    const res = await request(app).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body).toMatchObject({ loans: [], applications: [] });
  });

  it('калькулятор вклада считает доход, на неверную сумму отвечает ok: false', async () => {
    const id = await depositId('Талер 12');
    const ok = (await request(app).get(`/api/deposits/calc?product=${id}&amount=1000,00`)).body;
    expect(ok).toMatchObject({ ok: true, currency: 'BYN' });
    expect(ok.income).toBeGreaterThan(10000);
    expect(ok.total).toBeGreaterThan(100000 + ok.income - 1);
    expect((await request(app).get(`/api/deposits/calc?product=${id}&amount=abc`)).body).toEqual({ ok: false });
    expect((await request(app).get('/api/deposits/calc?product=999999&amount=100')).body).toEqual({ ok: false });
  });

  it('калькулятор кредита строит график, на неверные условия отвечает ok: false с ошибками', async () => {
    const id = await loanProductId();
    const ok = (await request(app).get(`/api/loans/calc?product=${id}&amount=3000,00&term=6&type=differentiated`)).body;
    expect(ok.ok).toBe(true);
    expect(ok.rows).toHaveLength(6);
    expect(ok.rows.reduce((t, r) => t + r.principal, 0)).toBe(300000);
    expect(ok.total - ok.overpay).toBe(300000);
    const bad = (await request(app).get(`/api/loans/calc?product=${id}&amount=3000,00&term=1&type=annuity`)).body;
    expect(bad.ok).toBe(false);
    expect(bad.errors.termMonths).toBeTruthy();
  });

  it('вошедший клиент видит в каталоге свои вклады', async () => {
    const c = await clientSession();
    const p = await depositId('Талер 12');
    await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: '1000,00' });
    const res = await c.api.get('/deposits');
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.mine).toHaveLength(1);
    expect(res.body.mine[0]).toMatchObject({ product_name: 'Талер 12', status: 'active' });
  });
});

describe('вклады через API', () => {
  it('страница открытия: вклады той же валюты и счета в нужной валюте', async () => {
    const c = await clientSession();
    const p = await depositId('Талер 12');
    const res = await c.api.get(`/deposits/new?product=${p}`);
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(p);
    expect(res.body.products.every((x) => x.currency === 'BYN')).toBe(true);
    expect(res.body.accounts.map((a) => a.id)).toEqual([c.accountId]);
    expect((await c.api.get('/deposits/new?product=999999')).status).toBe(404);
    // для валютного вклада нет подходящих счетов
    const usd = await c.api.get(`/deposits/new?product=${await depositId('Талер Валютный')}`);
    expect(usd.body.accounts).toEqual([]);
  });

  it('открывает вклад, показывает карточку и закрывает досрочно', async () => {
    const c = await clientSession(500000);
    const p = await depositId('Талер 12');
    const created = await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: '2000,00' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await getAccount(c.accountId)).balance).toBe(300000);

    const card = (await c.api.get(`/deposits/${id}`)).body;
    expect(card.deposit).toMatchObject({ id, status: 'active', balance: 200000, product_name: 'Талер 12' });
    expect(card.progress).toBeGreaterThanOrEqual(0);
    expect(card.daysLeft).toBeGreaterThan(300);

    const quote = (await c.api.get(`/deposits/${id}/close`)).body.quote;
    expect(quote.payout).toBeGreaterThan(0);
    expect(quote.deposit.id).toBe(id);

    const closed = await c.api.post(`/deposits/${id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.payout).toBe(quote.payout);
    expect((await getAccount(c.accountId)).balance).toBeGreaterThan(300000);
    expect((await c.api.get(`/deposits/${id}`)).body.deposit.status).toBe('early_closed');
    // повторное закрытие невозможно
    expect((await c.api.post(`/deposits/${id}/close`)).status).toBe(409);
  });

  it('ошибки открытия: сумма не распознана, меньше минимума, не хватает денег', async () => {
    const c = await clientSession(50000);
    const p = await depositId('Талер 12');
    const text = await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: 'много' });
    expect(text.status).toBe(422);
    expect(text.body.error.fields.amount).toContain('Введите сумму');
    const low = await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: '5,00' });
    expect(low.status).toBe(422);
    expect(low.body.error.fields.amount).toContain('Минимальная');
    const poor = await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: '900,00' });
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe('insufficient_funds');
  });

  it('безотзывный вклад закрыть досрочно нельзя', async () => {
    const c = await clientSession(1000000);
    const p = await depositId('Талер 24');
    const id = (await c.api.post('/deposits', { productId: p, sourceAccountId: c.accountId, amount: '1000,00' })).body.id;
    expect((await c.api.get(`/deposits/${id}`)).body.deposit.revocable).toBe(false);
    const res = await c.api.post(`/deposits/${id}/close`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('безотзывный');
  });

  it('чужой вклад недоступен, без входа 401, сотруднику закрыто', async () => {
    const owner = await clientSession(300000);
    const other = await clientSession(0);
    const id = (await owner.api.post('/deposits', { productId: await depositId('Талер 12'), sourceAccountId: owner.accountId, amount: '1000,00' })).body.id;
    expect((await other.api.get(`/deposits/${id}`)).status).toBe(404);
    expect((await other.api.get(`/deposits/${id}/close`)).status).toBe(404);
    expect((await other.api.post(`/deposits/${id}/close`)).status).toBe(404);

    const guest = apiClient(app);
    await guest.refresh();
    expect((await guest.get(`/deposits/${id}`)).status).toBe(401);
    expect((await guest.get('/deposits/new?product=1')).status).toBe(401);

    const officer = await staffSession('credit_officer', 'dep.officer');
    expect((await officer.get(`/deposits/${id}`)).status).toBe(403);
    expect((await officer.get('/deposits/new?product=1')).status).toBe(403);
  });
});
