import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { verifyClient } from '../src/services/kycService.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const app = createApp();

/** Получает страницу и достаёт из формы CSRF-токен. */
async function pageWithToken(agent, url) {
  const res = await agent.get(url);
  const token = /name="_csrf" value="([0-9a-f]+)"/.exec(res.text)?.[1];
  return { res, token };
}

const validForm = (login) => ({
  lastName: 'Иванова', firstName: 'Анна', patronymic: 'Сергеевна', birthDate: '1995-04-12',
  idNumber: '3010590A001PB4', passport: 'MC1234567', phone: '+375291234567', email: 'anna@example.by',
  login, password: 'Parol2026', passwordRepeat: 'Parol2026'
});

describe('публичные страницы', () => {
  it('главная и вход открываются', async () => {
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/login')).status).toBe(200);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
  });
  it('несуществующая страница даёт 404 с русским текстом', async () => {
    const res = await request(app).get('/net-takoy');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Такой страницы нет');
  });
  it('кабинет без входа ведёт на форму входа', async () => {
    const res = await request(app).get('/cabinet');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('защита форм', () => {
  it('POST без CSRF-токена отклоняется', async () => {
    const res = await request(app).post('/login').type('form').send({ login: 'a', password: 'b' });
    expect(res.status).toBe(403);
  });
});

describe('заявка клиента, проверка анкеты и вход', () => {
  it('проходит весь путь: заявка, верификация, вход, счёт в кабинете', async () => {
    const agent = request.agent(app);
    const { token } = await pageWithToken(agent, '/register');

    const bad = await agent.post('/register').type('form').send({ _csrf: token, ...validForm('ab'), idNumber: 'нет' });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('Идентификационный номер');

    const ok = await agent.post('/register').type('form').send({ _csrf: token, ...validForm('anna.test') });
    expect(ok.status).toBe(302);

    const dup = await agent.post('/register').type('form').send({ _csrf: token, ...validForm('anna.other') });
    expect(dup.status).toBe(422);
    expect(dup.text).toContain('уже подавал заявку');

    // персональные данные в базе хранятся только в зашифрованном виде
    const { rows: [client] } = await pool.query("SELECT c.id, id_number_enc, passport_enc FROM clients c JOIN users u ON u.id = c.user_id WHERE u.login = 'anna.test'");
    expect(client.id_number_enc).not.toContain('3010590A001PB4');
    expect(client.passport_enc).not.toContain('MC1234567');

    const operatorHash = await hashPassword('Operator2026');
    await pool.query('BEGIN');
    const opId = await userModel.create(pool, { login: 'op.test', passwordHash: operatorHash, roleCode: 'operator' });
    await pool.query('COMMIT');
    await verifyClient(client.id, opId);

    const { token: loginToken } = await pageWithToken(agent, '/login');
    const wrong = await agent.post('/login').type('form').send({ _csrf: loginToken, login: 'anna.test', password: 'wrong' });
    expect(wrong.status).toBe(401);
    expect(wrong.text).toContain('Неверный логин или пароль');

    const login = await agent.post('/login').type('form').send({ _csrf: loginToken, login: 'anna.test', password: 'Parol2026' });
    expect(login.status).toBe(302);

    const cabinet = await agent.get('/cabinet');
    expect(cabinet.status).toBe(200);
    expect(cabinet.text).toContain('Здравствуйте, Анна');
    expect(cabinet.text).toContain('Текущий счёт, BYN');
  });

  it('после серии неудачных попыток вход блокируется', async () => {
    const agent = request.agent(app);
    const hash = await hashPassword('Parol2026');
    await userModel.create(pool, { login: 'lock.test', passwordHash: hash, roleCode: 'client' });
    for (let i = 0; i < 5; i++) {
      const { token } = await pageWithToken(agent, '/login');
      await agent.post('/login').type('form').send({ _csrf: token, login: 'lock.test', password: 'bad' });
    }
    const { token } = await pageWithToken(agent, '/login');
    const res = await agent.post('/login').type('form').send({ _csrf: token, login: 'lock.test', password: 'Parol2026' });
    expect(res.status).toBe(429);
  });

  it('клиент не открывает рабочее место сотрудника по прямой ссылке', async () => {
    const agent = request.agent(app);
    const hash = await hashPassword('Parol2026');
    await userModel.create(pool, { login: 'plain.client', passwordHash: hash, roleCode: 'client' });
    const { token } = await pageWithToken(agent, '/login');
    await agent.post('/login').type('form').send({ _csrf: token, login: 'plain.client', password: 'Parol2026' });
    const res = await agent.get('/workplace');
    expect(res.status).toBe(403);
    expect(res.text).toContain('Недостаточно прав');
  });
});

describe('перевод через веб-форму', () => {
  it('крупный перевод: форма, код подтверждения, итог на странице счёта', async () => {
    const hash = await hashPassword('Parol2026');
    const a = await createClientWithAccount(300000, 'BYN', hash);
    const b = await createClientWithAccount(0);
    const agent = request.agent(app);
    const { token } = await pageWithToken(agent, '/login');
    await agent.post('/login').type('form').send({ _csrf: token, login: a.login, password: 'Parol2026' });

    const { res: formPage, token: formToken } = await pageWithToken(agent, '/transfers/new?kind=client');
    expect(formPage.status).toBe(200);
    expect(formPage.text).toContain('Номер счёта получателя');

    const iban = (await getAccount(b.accountId)).iban;
    const bad = await agent.post('/transfers').type('form').send({ _csrf: formToken, kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 'abc' });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('Введите сумму');

    const created = await agent.post('/transfers').type('form').send({ _csrf: formToken, kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: '250,00', comment: 'За аренду' });
    expect(created.status).toBe(302);
    const confirmUrl = created.headers.location;
    expect(confirmUrl).toMatch(/\/transfers\/[0-9a-f-]+\/confirm/);

    const { res: confirmPage, token: confirmToken } = await pageWithToken(agent, confirmUrl);
    const code = /<b>(\d{6})<\/b>/.exec(confirmPage.text)[1];
    const wrong = await agent.post(confirmUrl).type('form').send({ _csrf: confirmToken, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.text).toContain('Неверный код');

    const ok = await agent.post(confirmUrl).type('form').send({ _csrf: confirmToken, code });
    expect(ok.status).toBe(302);
    const page = await agent.get(ok.headers.location);
    expect(page.text).toContain('Перевод выполнен');
    expect(page.text).toContain('За аренду');
    expect((await getAccount(b.accountId)).balance).toBe(25000);
  });
});

describe('единая таблица стилей', () => {
  it('в шаблонах нет встроенных стилей: их блокирует CSP и они нарушают требование одной таблицы стилей', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve('src/views');
    const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
    for (const file of await walk(root)) {
      expect(await readFile(file, 'utf8'), file).not.toMatch(/\sstyle="/);
    }
  });
});

describe('страницы клиента открываются без ошибок', () => {
  it('все основные разделы отдают 200', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(500000, 'BYN', hash);
    const { issueCard } = await import('../src/services/cardService.js');
    const { pay } = await import('../src/services/paymentService.js');
    const card = await issueCard(c.userId, { accountId: c.accountId, system: 'visa', pin: '1111' });
    const providerId = (await pool.query("SELECT id FROM payment_providers WHERE name = 'Энергосбыт'")).rows[0].id;
    const payment = await pay(c.userId, { providerId, fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Свет' });

    const agent = request.agent(app);
    const { token } = await pageWithToken(agent, '/login');
    await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    const urls = ['/cabinet', '/accounts', `/accounts/${c.accountId}`, '/cards', '/cards/new', `/cards/${card.id}`,
      '/payments', '/payments/catalog', '/payments/catalog?q=вод', '/payments/catalog/1', '/payments/catalog/1?city=Минск', `/payments/pay/${providerId}`,
      `/payments/${payment.id}/receipt`, '/transfers/new', '/transfers/new?kind=own', '/transfers/interbank', '/deposits', '/deposits/new?product=1',
      '/loans', '/loans/new?product=1', '/loans/calc?product=1&amount=1000&term=12&type=annuity', '/deposits/calc?product=1&amount=1000'];
    for (const url of urls) {
      const res = await agent.get(url);
      expect(res.status, url).toBe(200);
    }
  });
});

describe('счета и курсы', () => {
  it('клиент открывает и закрывает счёт, курсы и конвертер открыты без входа', async () => {
    const { openForUser, closeForUser } = await import('../src/services/accountService.js');
    const c = await createClientWithAccount(0);
    const usd = await openForUser(c.userId, { kind: 'current', currency: 'USD' });
    expect(usd.currency).toBe('USD');
    expect(usd.iban).toMatch(/^BY\d{2}TLRB2400/);
    await expect(openForUser(c.userId, { kind: 'x', currency: 'USD' })).rejects.toMatchObject({ fields: { kind: expect.any(String) } });
    await closeForUser(c.userId, usd.id);
    expect((await pool.query('SELECT status FROM accounts WHERE id = $1', [usd.id])).rows[0].status).toBe('closed');
    // нельзя закрыть счёт с деньгами
    const rich = await createClientWithAccount(5000);
    await expect(closeForUser(rich.userId, rich.accountId)).rejects.toThrow(/нулевым остатком/);

    expect((await request(app).get('/rates')).status).toBe(200);
    const conv = await request(app).get('/rates/convert?from=USD&to=BYN&amount=100');
    expect(conv.body.ok).toBe(true);
    expect(conv.body.result).toBeGreaterThan(30000);
  });
});

describe('главная страница клиента', () => {
  it('показывает сумму по счетам в BYN с учётом валют, последние операции и курсы', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(100000, 'BYN', hash);
    const { addAccount } = await import('./helpers.js');
    await addAccount(c.clientId, 'USD', 10000);
    const { forClient } = await import('../src/services/dashboardService.js');
    const d = await forClient(c.userId);
    // 1000 BYN + 100 USD по курсу Нацбанка 3,275
    expect(d.totalByn).toBe(100000 + Math.round(10000 * 3.275));
    expect(d.operations.length).toBeGreaterThan(0);
    expect(d.rates.map((r) => r.currency)).toEqual(expect.arrayContaining(['USD', 'EUR', 'RUB']));
    expect(d.maxDepositRate).toBeGreaterThan(10);

    const agent = request.agent(app);
    const token = tokenOf(await agent.get('/login'));
    await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    const page = await agent.get('/cabinet');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Всего на счетах');
    expect(page.text).toContain('Платёжные карты');
    expect(page.text).toContain('Курсы Нацбанка');
  });
});

function tokenOf(res) {
  return /name="_csrf" value="([0-9a-f]+)"/.exec(res.text)[1];
}
