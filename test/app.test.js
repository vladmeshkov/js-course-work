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
