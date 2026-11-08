import { describe, it, expect, afterAll } from 'vitest';
import { createApp } from '../../server/app.js';
import { pool } from '../../server/db/pool.js';
import { hashPassword } from '../../server/modules/auth/auth.service.js';
import { createClientWithAccount, getAccount, closePool } from '../helpers.js';
import { loggedIn } from '../http.js';

afterAll(closePool);

const app = createApp();
const PASSWORD = 'Parol2026';

/** Клиент с деньгами на счёте и уже вошедший в систему. */
async function clientWith(balance) {
  const c = await createClientWithAccount(balance, 'BYN', await hashPassword(PASSWORD));
  return { ...c, api: await loggedIn(app, c.login, PASSWORD) };
}

const providerId = async (name = 'Энергосбыт') => (await pool.query('SELECT id FROM payment_providers WHERE name = ?', [name])).rows[0].id;


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
