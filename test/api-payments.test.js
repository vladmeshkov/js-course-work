import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { buildIban } from '../src/lib/iban.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, addAccount, getAccount, closePool } from './helpers.js';
import { apiClient, loggedIn } from './http.js';

afterAll(closePool);

const app = createApp();
const PASSWORD = 'Parol2026';

/** Клиент с деньгами на счёте и уже вошедший в систему. */
async function clientWith(balance) {
  const c = await createClientWithAccount(balance, 'BYN', await hashPassword(PASSWORD));
  return { ...c, api: await loggedIn(app, c.login, PASSWORD) };
}

const providerId = async (name = 'Энергосбыт') => (await pool.query('SELECT id FROM payment_providers WHERE name = ?', [name])).rows[0].id;
const extIban = (code, n = 1) => buildIban(code, '2400', n);
const wrongCode = (code) => (code === '000000' ? '111111' : '000000');

describe('перевод клиенту банка через API', () => {
  it('крупный перевод: форма, код подтверждения, итог на счетах', async () => {
    const a = await clientWith(300000);
    const b = await createClientWithAccount(0);
    const iban = (await getAccount(b.accountId)).iban;

    const form = await a.api.get('/transfers/new?kind=client');
    expect(form.status).toBe(200);
    expect(form.body.kind).toBe('client');
    expect(form.body.accounts[0]).toMatchObject({ id: a.accountId, currency: 'BYN', balance: 300000 });

    const bad = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 'abc' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('validation');
    expect(bad.body.error.fields.amount).toContain('Введите сумму');

    const noAccount = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: 'BY00', amount: '10,00' });
    expect(noAccount.status).toBe(422);
    expect(noAccount.body.error.fields.toIban).toBeTruthy();

    const created = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: '250,00', comment: 'За аренду' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ review: false, executed: false, fromAccountId: a.accountId, sentTo: null });
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const code = created.body.demoCode;
    expect(code).toMatch(/^\d{6}$/);

    // экран подтверждения получает то же, что раньше шаблон, в том числе учебный код
    const screen = await a.api.get(`/transfers/${created.body.id}/confirm`);
    expect(screen.status).toBe(200);
    expect(screen.body.intent).toMatchObject({ status: 'new', amount: 25000, fee: 0, comment: 'За аренду' });
    expect(screen.body.from).toMatchObject({ iban: (await getAccount(a.accountId)).iban, currency: 'BYN' });
    expect(screen.body.to.iban).toBe(iban);
    expect(screen.body.demoCode).toBe(code);

    const wrong = await a.api.post(`/transfers/${created.body.id}/confirm`, { code: wrongCode(code) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toContain('Неверный код');
    expect((await getAccount(b.accountId)).balance).toBe(0);

    const ok = await a.api.post(`/transfers/${created.body.id}/confirm`, { code });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'ok', fromAccountId: a.accountId, message: 'Перевод выполнен' });
    expect((await getAccount(b.accountId)).balance).toBe(25000);
    expect((await getAccount(a.accountId)).balance).toBe(275000);

    // обработанный перевод больше не ждёт кода: клиент по статусу уходит на страницу счёта
    const again = await a.api.get(`/transfers/${created.body.id}/confirm`);
    expect(again.body.intent.status).toBe('confirmed');
    expect(again.body.demoCode).toBeNull();
    const repeat = await a.api.post(`/transfers/${created.body.id}/confirm`, { code });
    expect(repeat.status).toBe(409);
  });

  it('малый перевод проходит сразу, без кода', async () => {
    const a = await clientWith(50000);
    const b = await createClientWithAccount(0);
    const res = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: '20,00', comment: 'Кофе' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ executed: true, review: false, demoCode: null });
    expect((await getAccount(b.accountId)).balance).toBe(2000);
  });

  it('отмена перевода: код больше не подходит', async () => {
    const a = await clientWith(300000);
    const b = await createClientWithAccount(0);
    const created = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: '200,00' });
    const cancel = await a.api.post(`/transfers/${created.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.message).toBe('Перевод отменён');
    const res = await a.api.post(`/transfers/${created.body.id}/confirm`, { code: created.body.demoCode });
    expect(res.status).toBe(409);
    expect((await getAccount(b.accountId)).balance).toBe(0);
  });

  it('чужой перевод нельзя открыть, подтвердить и отменить', async () => {
    const a = await clientWith(300000);
    const stranger = await clientWith(1000);
    const b = await createClientWithAccount(0);
    const created = await a.api.post('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: '200,00' });
    expect((await stranger.api.get(`/transfers/${created.body.id}/confirm`)).status).toBe(404);
    const steal = await stranger.api.post(`/transfers/${created.body.id}/confirm`, { code: created.body.demoCode });
    expect(steal.status).toBe(404);
    await stranger.api.post(`/transfers/${created.body.id}/cancel`);
    // отмена чужим не сработала: владелец всё ещё подтверждает
    const ok = await a.api.post(`/transfers/${created.body.id}/confirm`, { code: created.body.demoCode });
    expect(ok.status).toBe(200);
    expect((await getAccount(b.accountId)).balance).toBe(20000);
  });

  it('нельзя списать с чужого счёта', async () => {
    const a = await clientWith(100000);
    const other = await createClientWithAccount(100000);
    const b = await createClientWithAccount(0);
    const res = await a.api.post('/transfers', { kind: 'client', fromAccountId: other.accountId, toIban: (await getAccount(b.accountId)).iban, amount: '10,00' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.fromAccountId).toBeTruthy();
    expect((await getAccount(other.accountId)).balance).toBe(100000);
  });
});

describe('перевод между своими счетами', () => {
  it('с конвертацией валют, без кода и комиссии', async () => {
    const a = await clientWith(100000);
    const usd = await addAccount(a.clientId, 'USD', 0);
    const form = await a.api.get(`/transfers/new?kind=own&from=${a.accountId}`);
    expect(form.body).toMatchObject({ kind: 'own', fromAccountId: a.accountId });
    expect(form.body.accounts.map((x) => x.currency)).toEqual(['BYN', 'USD']);

    const same = await a.api.post('/transfers', { kind: 'own', fromAccountId: a.accountId, toAccountId: a.accountId, amount: '10,00' });
    expect(same.status).toBe(422);
    expect(same.body.error.fields.toAccountId).toBeTruthy();

    const res = await a.api.post('/transfers', { kind: 'own', fromAccountId: a.accountId, toAccountId: usd.id, amount: '327,50' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ executed: true, review: false, fromAccountId: a.accountId, demoCode: null });
    expect((await getAccount(a.accountId)).balance).toBe(100000 - 32750);
    const received = (await getAccount(usd.id)).balance;
    expect(received).toBeGreaterThan(8000);
    expect(received).toBeLessThan(10500);
  });
});

describe('перевод в другой банк', () => {
  it('форма, создание, неверный и верный код, постановка в очередь', async () => {
    const a = await clientWith(100000);
    const form = await a.api.get('/transfers/interbank');
    expect(form.status).toBe(200);
    expect(form.body.accounts.map((x) => x.id)).toEqual([a.accountId]);
    expect(form.body.banks.some((b) => b.code === 'DRZH' && b.active)).toBe(true);
    expect(form.body.history).toEqual([]);

    const bad = await a.api.post('/transfers/interbank', { fromAccountId: a.accountId, iban: extIban('DRZH'), name: 'Иван Петров', amount: 'x' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.amount).toBeTruthy();
    const noBank = await a.api.post('/transfers/interbank', { fromAccountId: a.accountId, iban: extIban('XXXX'), name: 'Иван Петров', amount: '10,00' });
    expect(noBank.status).toBe(422);
    expect(noBank.body.error.fields.iban).toContain('не найден');

    const created = await a.api.post('/transfers/interbank', { fromAccountId: a.accountId, iban: extIban('DRZH', a.accountId), name: 'Иван Петров', amount: '200,00', purpose: 'Аренда' });
    expect(created.status).toBe(201);
    expect(created.body.demoCode).toMatch(/^\d{6}$/);

    const screen = await a.api.get(`/transfers/interbank/${created.body.id}/confirm`);
    expect(screen.body.transfer).toMatchObject({ status: 'pending_otp', amount: 20000, fee: 100, counterparty_name: 'Иван Петров' });
    expect(screen.body.transfer.bank_name).toBeTruthy();
    expect(screen.body.demoCode).toBe(created.body.demoCode);
    // оценка риска клиенту не показывается
    expect(JSON.stringify(screen.body)).not.toContain('risk_');

    const wrong = await a.api.post(`/transfers/interbank/${created.body.id}/confirm`, { code: wrongCode(created.body.demoCode) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('otp_wrong');

    const ok = await a.api.post(`/transfers/interbank/${created.body.id}/confirm`, { code: created.body.demoCode });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toContain('закрытии операционного дня');
    const after = await a.api.get('/transfers/interbank');
    expect(after.body.history[0]).toMatchObject({ id: created.body.id, status: 'queued', amount: 20000 });
    // подтверждённый перевод больше не ждёт кода (клиент по статусу уходит к списку)
    expect((await a.api.get(`/transfers/interbank/${created.body.id}/confirm`)).body.transfer.status).toBe('queued');
  });

  it('отмена до отправки снимает резерв', async () => {
    const a = await clientWith(100000);
    const created = await a.api.post('/transfers/interbank', { fromAccountId: a.accountId, iban: extIban('DRZH', a.accountId), name: 'Пётр Сидоров', amount: '100,00' });
    await a.api.post(`/transfers/interbank/${created.body.id}/confirm`, { code: created.body.demoCode });
    const cancel = await a.api.post(`/transfers/interbank/${created.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.message).toContain('разблокированы');
    const history = (await a.api.get('/transfers/interbank')).body.history;
    expect(history[0].status).toBe('cancelled');
    const twice = await a.api.post(`/transfers/interbank/${created.body.id}/cancel`);
    expect(twice.status).toBe(409);
    const { rows } = await pool.query("SELECT count(*) AS n FROM holds WHERE account_id = ? AND status = 'active'", [a.accountId]);
    expect(Number(rows[0].n)).toBe(0);
  });

  it('чужой межбанковский перевод недоступен', async () => {
    const a = await clientWith(100000);
    const stranger = await clientWith(1000);
    const created = await a.api.post('/transfers/interbank', { fromAccountId: a.accountId, iban: extIban('DRZH', a.accountId), name: 'Пётр Сидоров', amount: '100,00' });
    expect((await stranger.api.get(`/transfers/interbank/${created.body.id}/confirm`)).status).toBe(404);
    expect((await stranger.api.post(`/transfers/interbank/${created.body.id}/confirm`, { code: created.body.demoCode })).status).toBe(404);
    expect((await stranger.api.post(`/transfers/interbank/${created.body.id}/cancel`)).status).toBe(404);
    expect((await a.api.get('/transfers/interbank/abc/confirm')).status).toBe(404);
  });
});

describe('каталог платежей и оплата', () => {
  it('каталог, категория, поиск, форма оплаты', async () => {
    const c = await clientWith(100000);
    const catalog = (await c.api.get('/payments/catalog')).body;
    expect(catalog.categories.length).toBeGreaterThan(3);
    expect(catalog.categories[0]).toMatchObject({ icon: expect.any(String), count: expect.any(Number) });
    expect(catalog.found).toEqual([]);
    expect(catalog.popular.map((p) => p.name)).toContain('Энергосбыт');

    const found = (await c.api.get(`/payments/catalog?q=${encodeURIComponent('энерго')}`)).body;
    expect(found.q).toBe('энерго');
    expect(found.found.map((p) => p.name)).toContain('Энергосбыт');
    expect((await c.api.get(`/payments/catalog?q=${encodeURIComponent('нет такой услуги')}`)).body.found).toEqual([]);

    const category = (await c.api.get(`/payments/catalog/${catalog.categories[0].id}`)).body;
    expect(category.category.id).toBe(catalog.categories[0].id);
    expect(category.providers.length).toBe(catalog.categories[0].count);
    expect((await c.api.get('/payments/catalog/999999')).status).toBe(404);
    expect((await c.api.get('/payments/catalog/abc')).status).toBe(404);

    const id = await providerId();
    const pay = (await c.api.get(`/payments/pay/${id}`)).body;
    expect(pay.provider).toMatchObject({ id, name: 'Энергосбыт' });
    expect(pay.accounts.map((a) => a.id)).toEqual([c.accountId]);
    expect(pay.form).toEqual({});
    expect(pay.history).toEqual([]);
    expect((await c.api.get('/payments/pay/999999')).status).toBe(404);
  });

  it('оплата услуги: ошибки, списание, квитанция, история', async () => {
    const c = await clientWith(100000);
    const id = await providerId();
    const base = { providerId: id, fromAccountId: c.accountId, requisite: '12345678', amount: '25,40' };

    const noAmount = await c.api.post('/payments/pay', { ...base, amount: '' });
    expect(noAmount.status).toBe(422);
    expect(noAmount.body.error.fields.amount).toContain('Введите сумму');
    const noReq = await c.api.post('/payments/pay', { ...base, requisite: 'zz' });
    expect(noReq.status).toBe(422);
    expect(noReq.body.error.fields.requisite).toBeTruthy();
    expect((await getAccount(c.accountId)).balance).toBe(100000);

    const paid = await c.api.post('/payments/pay', base);
    expect(paid.status).toBe(201);
    expect(paid.body.id).toEqual(expect.any(Number));
    expect((await getAccount(c.accountId)).balance).toBe(100000 - 2540);

    const receipt = await c.api.get(`/payments/${paid.body.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.r).toMatchObject({ id: paid.body.id, provider_name: 'Энергосбыт', requisite: '12345678', amount: 2540, fee: 0 });
    expect(receipt.body.r.iban).toBe((await getAccount(c.accountId)).iban);
    expect((await c.api.get(`/payments/pay/${id}`)).body.history[0]).toMatchObject({ id: paid.body.id, amount: 2540 });
    expect((await c.api.get('/payments')).body.recent[0].id).toBe(paid.body.id);

    const pdf = await c.api.agent.get(`/api/payments/${paid.body.id}/receipt.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('квитанцию видит только владелец платежа', async () => {
    const c = await clientWith(100000);
    const stranger = await clientWith(1000);
    const paid = await c.api.post('/payments/pay', { providerId: await providerId(), fromAccountId: c.accountId, requisite: '12345678', amount: '10,00' });
    expect((await stranger.api.get(`/payments/${paid.body.id}/receipt`)).status).toBe(404);
    expect((await c.api.get('/payments/abc/receipt')).status).toBe(404);
  });

  it('шаблон и автоплатёж: сохранение, предзаполнение формы, включение, отключение, удаление', async () => {
    const c = await clientWith(100000);
    const id = await providerId();
    await c.api.post('/payments/pay', { providerId: id, fromAccountId: c.accountId, requisite: '12345678', amount: '30,00', saveTemplate: 'on', templateName: 'Свет', saveAmount: 'on' });
    const hub = (await c.api.get('/payments')).body;
    expect(hub.templates).toHaveLength(1);
    const tpl = hub.templates[0];
    expect(tpl).toMatchObject({ name: 'Свет', requisite: '12345678', amount: 3000, provider_name: 'Энергосбыт' });

    const prefilled = (await c.api.get(`/payments/pay/${id}?template=${tpl.id}`)).body;
    expect(prefilled.form).toEqual({ requisite: '12345678', fromAccountId: c.accountId, amount: '30' });
    expect((await c.api.get(`/payments/pay/${id}?template=999999`)).status).toBe(404);

    const bad = await c.api.post(`/payments/templates/${tpl.id}/autopay`, { amount: '', day: '5' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.amount).toBeTruthy();
    const badDay = await c.api.post(`/payments/templates/${tpl.id}/autopay`, { amount: '30,00', day: '40' });
    expect(badDay.status).toBe(422);
    expect(badDay.body.error.fields.day).toBeTruthy();

    const auto = await c.api.post(`/payments/templates/${tpl.id}/autopay`, { amount: '30,00', day: '5' });
    expect(auto.status).toBe(201);
    expect(auto.body.message).toBe('Автоплатёж включён');
    const withAuto = (await c.api.get('/payments')).body;
    expect(withAuto.autopayments).toHaveLength(1);
    expect(withAuto.autopayments[0]).toMatchObject({ template_id: tpl.id, amount: 3000, day_of_month: 5 });
    expect((await c.api.get('/payments/catalog')).body.autopayments).toHaveLength(1);

    const off = await c.api.post(`/payments/autopay/${withAuto.autopayments[0].id}/cancel`);
    expect(off.status).toBe(200);
    expect(off.body.message).toBe('Автоплатёж отключён');
    expect((await c.api.get('/payments')).body.autopayments).toHaveLength(0);

    const del = await c.api.post(`/payments/templates/${tpl.id}/delete`);
    expect(del.status).toBe(200);
    expect(del.body.message).toBe('Шаблон удалён');
    expect((await c.api.get('/payments')).body.templates).toHaveLength(0);
  });

  it('чужие шаблоны недоступны', async () => {
    const c = await clientWith(100000);
    const stranger = await clientWith(1000);
    await c.api.post('/payments/pay', { providerId: await providerId(), fromAccountId: c.accountId, requisite: '12345678', amount: '30,00', saveTemplate: 'on', templateName: 'Свет' });
    const tpl = (await c.api.get('/payments')).body.templates[0];
    expect((await stranger.api.post(`/payments/templates/${tpl.id}/autopay`, { amount: '10,00', day: '3' })).status).toBe(404);
    await stranger.api.post(`/payments/templates/${tpl.id}/delete`);
    expect((await c.api.get('/payments')).body.templates).toHaveLength(1);
  });
});

describe('права и защита', () => {
  const routes = [
    ['get', '/payments'], ['get', '/payments/catalog'], ['get', '/payments/catalog/1'], ['get', '/payments/pay/1'], ['post', '/payments/pay'],
    ['get', '/payments/1/receipt'], ['get', '/payments/1/receipt.pdf'], ['post', '/payments/templates/1/delete'], ['post', '/payments/templates/1/autopay'],
    ['post', '/payments/autopay/1/cancel'], ['get', '/transfers/new'], ['post', '/transfers'], ['get', '/transfers/abc/confirm'],
    ['post', '/transfers/abc/confirm'], ['post', '/transfers/abc/cancel'], ['get', '/transfers/interbank'], ['post', '/transfers/interbank'],
    ['get', '/transfers/interbank/1/confirm'], ['post', '/transfers/interbank/1/confirm'], ['post', '/transfers/interbank/1/cancel']
  ];

  it('гость получает 401 на всех маршрутах', async () => {
    const guest = apiClient(app);
    await guest.refresh();
    for (const [method, url] of routes) {
      const res = await guest[method](url, {});
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
  });

  it('сотрудник банка получает 403: переводы и платежи только для клиентов', async () => {
    const [{ value: before }] = (await pool.query("SELECT value FROM settings WHERE `key` = 'security.require_2fa_staff'")).rows;
    await pool.query("UPDATE settings SET value = '0' WHERE `key` = 'security.require_2fa_staff'");
    try {
      await userModel.create(pool, { login: 'payments.operator', passwordHash: await hashPassword(PASSWORD), roleCode: 'operator' });
      const staff = await loggedIn(app, 'payments.operator', PASSWORD);
      for (const [method, url] of routes) {
        const res = await staff[method](url, {});
        expect(res.status, `${method} ${url}`).toBe(403);
        expect(res.body.error.code).toBe('forbidden');
      }
    } finally {
      await pool.query("UPDATE settings SET value = ? WHERE `key` = 'security.require_2fa_staff'", [before]);
    }
  });

  it('запрос без токена CSRF отклоняется, перевод не создаётся', async () => {
    const a = await clientWith(100000);
    const b = await createClientWithAccount(0);
    const res = await a.api.postWithoutToken('/transfers', { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: '5,00' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf');
    expect((await getAccount(b.accountId)).balance).toBe(0);
  });
});

describe('страницы клиента открываются без ошибок', () => {
  it('все адреса переводов и платежей отдают 200', async () => {
    const c = await clientWith(500000);
    const { pay } = await import('../src/services/paymentService.js');
    const id = await providerId();
    const payment = await pay(c.userId, { providerId: id, fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Свет' });
    const urls = ['/payments', '/payments/catalog', '/payments/catalog?q=вод', '/payments/catalog/1', '/payments/catalog/1?city=Минск', `/payments/pay/${id}`,
      `/payments/${payment.id}/receipt`, '/transfers/new', '/transfers/new?kind=own', '/transfers/interbank'];
    for (const url of urls) {
      const res = await c.api.get(url);
      expect(res.status, url).toBe(200);
    }
  });

  it('оболочка приложения отдаёт клиентские страницы модуля', async () => {
    for (const url of ['/payments', '/payments/catalog', '/payments/catalog/1', '/payments/pay/1', '/payments/1/receipt', '/transfers/new', '/transfers/interbank', '/transfers/interbank/1/confirm', '/transfers/abc/confirm']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.text).toContain('<main id="content"');
    }
  });
});
