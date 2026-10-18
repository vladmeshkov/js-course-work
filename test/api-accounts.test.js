import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';
import { loggedIn } from './http.js';

afterAll(closePool);

const app = createApp();
const hash = await hashPassword('Parol2026');
const newClient = (balance = 0, currency = 'BYN') => createClientWithAccount(balance, currency, hash);
const pdf = (client, url) => client.get(url).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (d) => chunks.push(d)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

async function staff(roleCode = 'operator') {
  const login = `staff${Date.now()}${Math.floor(Math.random() * 100000)}`;
  await userModel.create(pool, { login, passwordHash: hash, roleCode });
  return loggedIn(app, login);
}

describe('API счетов', () => {
  it('список счетов и открытие нового счёта', async () => {
    const c = await newClient(5000);
    const client = await loggedIn(app, c.login);
    const list = (await client.get('/accounts')).body;
    expect(list.accounts).toHaveLength(1);
    expect(list.accounts[0]).toMatchObject({ id: c.accountId, currency: 'BYN', balance: 5000 });

    const bad = await client.post('/accounts', { kind: 'x', currency: 'USD' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.kind).toBeTruthy();

    const created = await client.post('/accounts', { kind: 'savings', currency: 'USD' });
    expect(created.status).toBe(201);
    expect(created.body.message).toBe('Счёт открыт');
    const { account, operations } = (await client.get(`/accounts/${created.body.id}`)).body;
    expect(account).toMatchObject({ currency: 'USD', kind: 'savings', balance: 0 });
    expect(account.iban).toMatch(/^BY\d{2}TLRB24/);
    expect(operations).toEqual([]);
    expect((await client.get('/accounts')).body.accounts).toHaveLength(2);
  });

  it('закрытие: только с нулевым остатком', async () => {
    const c = await newClient(5000);
    const client = await loggedIn(app, c.login);
    const refused = await client.post(`/accounts/${c.accountId}/close`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/нулевым остатком/);
    const extra = (await client.post('/accounts', { kind: 'current', currency: 'EUR' })).body.id;
    const closed = await client.post(`/accounts/${extra}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.message).toBe('Счёт закрыт');
    expect((await getAccount(extra)).status).toBe('closed');
    expect((await client.get('/accounts')).body.accounts.map((a) => a.id)).toEqual([c.accountId]);
  });

  it('операции по счёту и выписка в JSON', async () => {
    const c = await newClient(10000);
    const client = await loggedIn(app, c.login);
    const { operations } = (await client.get(`/accounts/${c.accountId}`)).body;
    expect(operations[0]).toMatchObject({ signed: 10000, currency: 'BYN' });
    const { statement, accounts } = (await client.get(`/accounts/${c.accountId}/statement`)).body;
    expect(statement).toMatchObject({ opening: 0, closing: 10000, credit: 10000, debit: 0 });
    expect(statement.account.id).toBe(c.accountId);
    expect(statement.operations).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    const bad = await client.get(`/accounts/${c.accountId}/statement?from=2026-12-01&to=2026-01-01`);
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.from).toBeTruthy();
  });

  it('чужой счёт недоступен, сотрудник и гость не открывают клиентские маршруты', async () => {
    const a = await newClient(1000);
    const b = await newClient(1000);
    const client = await loggedIn(app, b.login);
    for (const url of [`/accounts/${a.accountId}`, `/accounts/${a.accountId}/statement`, `/accounts/${a.accountId}/statement.pdf`, `/accounts/${a.accountId}/certificate.pdf`]) {
      expect((await client.get(url)).status, url).toBe(404);
    }
    expect((await client.post(`/accounts/${a.accountId}/close`)).status).toBe(409);
    expect((await getAccount(a.accountId)).status).toBe('open');

    const op = await staff();
    for (const url of ['/accounts', `/accounts/${a.accountId}`, `/accounts/${a.accountId}/statement`, `/accounts/${a.accountId}/statement.pdf`, '/cards', '/cards/new']) {
      const res = await op.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }
    expect((await op.post('/accounts', { kind: 'current', currency: 'USD' })).status).toBe(403);
    expect((await op.post('/cards', { accountId: a.accountId, system: 'visa', pin: '1234' })).status).toBe(403);

    for (const url of ['/accounts', '/accounts/1', '/accounts/1/statement.pdf', '/cards', '/cards/1']) {
      const res = await request(app).get(`/api${url}`);
      expect(res.status, url).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
  });

  it('PDF выписки и справки отдаются как application/pdf', async () => {
    const c = await newClient(7000);
    const client = await loggedIn(app, c.login);
    for (const url of [`/accounts/${c.accountId}/statement.pdf`, `/accounts/${c.accountId}/statement.pdf?from=2026-01-01&to=2026-12-31`, `/accounts/${c.accountId}/certificate.pdf`]) {
      const res = await pdf(client, url);
      expect(res.status, url).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});

describe('API карт', () => {
  const issue = (client, accountId, extra = {}) => client.post('/cards', { accountId, system: 'visa', pin: '1234', ...extra });

  it('выпуск: пустой список, форма, номер и CVV показываются один раз', async () => {
    const c = await newClient(0);
    const client = await loggedIn(app, c.login);
    expect((await client.get('/cards')).body).toMatchObject({ cards: [], systems: { visa: 'Visa', belkart: 'Белкарт', mastercard: 'Mastercard' } });
    const form = (await client.get('/cards/new')).body;
    expect(form.accounts.map((a) => a.id)).toEqual([c.accountId]);

    const bad = await issue(client, c.accountId, { pin: '12' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.pin).toBeTruthy();

    const created = await issue(client, c.accountId);
    expect(created.status).toBe(201);
    const first = (await client.get(`/cards/${created.body.id}`)).body;
    expect(first.secret).toMatchObject({ id: created.body.id, number: expect.stringMatching(/^\d{16}$/), cvv: expect.stringMatching(/^\d{3}$/) });
    expect(first.card).toMatchObject({ status: 'active', system: 'visa', last4: first.secret.number.slice(-4) });
    expect(first.card.number_enc).toBeUndefined();
    expect(first.card.pin_hash).toBeUndefined();
    expect(first.cards).toHaveLength(1);
    expect((await client.get(`/cards/${created.body.id}`)).body.secret).toBeNull();
    expect((await client.get('/cards')).body.cards).toHaveLength(1);
  });

  it('блокировка, разблокировка и закрытие карты', async () => {
    const c = await newClient(0);
    const client = await loggedIn(app, c.login);
    const id = (await issue(client, c.accountId)).body.id;
    const blocked = await client.post(`/cards/${id}/block`, { action: 'block' });
    expect(blocked.body.message).toBe('Карта заблокирована');
    expect((await client.get(`/cards/${id}`)).body.card.status).toBe('blocked');
    const unblocked = await client.post(`/cards/${id}/block`, { action: 'unblock' });
    expect(unblocked.body.message).toBe('Карта разблокирована');
    expect((await client.get(`/cards/${id}`)).body.card.status).toBe('active');
    expect((await client.post(`/cards/${id}/close`)).body.message).toBe('Карта закрыта');
    expect((await client.get('/cards')).body.cards).toEqual([]);
    expect((await client.post(`/cards/${id}/block`, { action: 'block' })).status).toBe(409);
  });

  it('лимиты: сохранение, проверка противоречий, запрет интернет-платежей', async () => {
    const c = await newClient(1000000);
    const client = await loggedIn(app, c.login);
    const id = (await issue(client, c.accountId)).body.id;
    const bad = await client.post(`/cards/${id}/limits`, { perOp: '500,00', daily: '100,00', monthly: '900,00', online: 'on' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.perOp).toBeTruthy();
    const ok = await client.post(`/cards/${id}/limits`, { perOp: '200,00', daily: '300,00', monthly: '500,00' });
    expect(ok.body.message).toBe('Лимиты сохранены');
    expect((await client.get(`/cards/${id}`)).body.card).toMatchObject({ per_op_limit: 20000, daily_limit: 30000, monthly_limit: 50000, online_enabled: false });
    const online = await client.post(`/cards/${id}/purchase`, { place: 'Сайт', amount: '1,00', online: 'on' });
    expect(online.status).toBe(409);
    expect(online.body.error.code).toBe('online_disabled');
    const over = await client.post(`/cards/${id}/purchase`, { place: 'Магазин', amount: '200,01' });
    expect(over.body.error.code).toBe('per_op_limit');
  });

  it('покупка списывает деньги и попадает в операции карты', async () => {
    const c = await newClient(100000);
    const client = await loggedIn(app, c.login);
    const id = (await issue(client, c.accountId)).body.id;
    const res = await client.post(`/cards/${id}/purchase`, { place: 'Евроопт', amount: '25,50' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Операция выполнена');
    expect((await getAccount(c.accountId)).balance).toBe(100000 - 2550);
    const { operations } = (await client.get(`/cards/${id}`)).body;
    expect(operations[0]).toMatchObject({ amount: 2550, place: 'Евроопт' });
    const empty = await client.post(`/cards/${id}/purchase`, { place: 'Евроопт', amount: '' });
    expect(empty.status).toBeGreaterThanOrEqual(400);
    expect(empty.status).toBeLessThan(500);
    const poorUser = await newClient(1000);
    const poor = await loggedIn(app, poorUser.login);
    const poorCard = (await issue(poor, poorUser.accountId)).body.id;
    const refused = await poor.post(`/cards/${poorCard}/purchase`, { place: 'Евроопт', amount: '20,00' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('insufficient_funds');
  });

  it('чужая карта недоступна', async () => {
    const a = await newClient(0);
    const b = await newClient(1000);
    const owner = await loggedIn(app, a.login);
    const other = await loggedIn(app, b.login);
    const id = (await issue(owner, a.accountId)).body.id;
    for (const [method, url, body] of [['get', `/cards/${id}`], ['post', `/cards/${id}/block`, { action: 'block' }], ['post', `/cards/${id}/close`], ['post', `/cards/${id}/limits`, { perOp: '1', daily: '1', monthly: '1' }], ['post', `/cards/${id}/purchase`, { amount: '1,00' }]]) {
      expect((await other[method](url, body)).status, url).toBe(404);
    }
    // привязать карту к чужому счёту нельзя
    const stolen = await issue(other, a.accountId);
    expect(stolen.status).toBe(422);
    expect(stolen.body.error.fields.accountId).toBeTruthy();
  });
});

describe('дымовая проверка адресов клиента', () => {
  it('все страницы счетов, карт и документов отвечают без ошибок', async () => {
    const c = await newClient(50000);
    const client = await loggedIn(app, c.login);
    const cardId = (await client.post('/cards', { accountId: c.accountId, system: 'belkart', pin: '4321' })).body.id;
    for (const url of ['/accounts', '/accounts/' + c.accountId, `/accounts/${c.accountId}/statement`, `/accounts/${c.accountId}/statement?from=2026-01-01&to=2026-12-31&kind=in`, '/cards', '/cards/new', `/cards/${cardId}`]) {
      const res = await client.get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    }
    // страницы приложения отдаются оболочкой на любой адрес
    for (const url of ['/accounts', '/accounts/new', `/accounts/${c.accountId}/statement`, '/cards', '/cards/new']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.text).toContain('<main id="content"');
    }
  });
});
