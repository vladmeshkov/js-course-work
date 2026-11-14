import { describe, it, expect, afterAll } from 'vitest';
import { createApp } from '../../server/app.js';
import { pool } from '../../server/db/pool.js';
import { register, hashPassword } from '../../server/modules/auth/auth.service.js';
import { rejectClient } from '../../server/modules/clients/kyc.service.js';
import * as userModel from '../../server/modules/auth/user.model.js';
import { likePattern, parseId } from '../../server/shared/validate.js';
import { createClientWithAccount, closePool } from '../helpers.js';
import { apiClient, loggedIn } from '../http.js';

afterAll(closePool);
const app = createApp();
let seq = 0;
const unique = () => `${Date.now() % 100000}${++seq}`;

async function staff(roleCode) {
  const login = `hd${roleCode.slice(0, 3)}${unique()}`;
  const id = await userModel.create(pool, { login, passwordHash: await hashPassword('Parol2026'), roleCode });
  return { id, api: await loggedIn(app, login) };
}

const form = (login, idNumber, extra = {}) => ({
  login, password: 'Parol2026', passwordRepeat: 'Parol2026', lastName: 'Орлов', firstName: 'Олег', birthDate: '1985-03-03',
  idNumber, passport: 'MC7654321', phone: '+375291112255', ...extra
});

describe('входные данные', () => {
  it('нечисловой идентификатор в адресе даёт 404, а не ошибку сервера', async () => {
    const c = await createClientWithAccount(0, 'BYN', await hashPassword('Parol2026'));
    const client = await loggedIn(app, c.login);
    for (const url of ['/accounts/abc', '/deposits/NaN', '/cards/1e999', '/loans/-5']) {
      const res = await client.get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error.details).toBeUndefined();
    }
    // нечисловой счёт в теле запроса: ошибка проверки, а не 500
    const transfer = await client.post('/transfers', { kind: 'own', fromAccountId: 'x', toAccountId: 'y', amount: '10' });
    expect(transfer.status).toBe(422);
    expect(() => parseId('12abc')).toThrow();
    expect(parseId('42')).toBe(42);
  });

  it('запрос без тела JSON и подделанные типы полей не роняют сервер', async () => {
    const client = apiClient(app);
    await client.refresh();
    const token = (await client.session()).csrfToken;
    const empty = await client.agent.post('/api/login').set('X-CSRF-Token', token);
    expect(empty.status).toBe(401);
    const arrays = await client.post('/register', { lastName: ['a'], firstName: { x: 1 }, login: ['x'] });
    expect(arrays.status).toBe(422);
  });

  it('длинные имена отклоняются проверкой, а не ошибкой базы', async () => {
    const client = apiClient(app);
    await client.refresh();
    const res = await client.post('/register', form(`long${unique()}`, '3010590A001PB4', { lastName: 'Я'.repeat(150) }));
    expect(res.status).toBe(422);
    expect(res.body.error.fields.lastName).toMatch(/100/);
  });

  it('CSRF-токен с не-ASCII символами даёт 403, а не 500', async () => {
    const client = apiClient(app);
    await client.refresh();
    // 48 символов latin1 (по длине строки совпадает с настоящим токеном, по байтам нет)
    const res = await client.agent.post('/api/login').set('X-CSRF-Token', 'é'.repeat(48)).send({});
    expect(res.status).toBe(403);
  });

  it('GET без сессии не создаёт сессию, токен выдаёт только /session', async () => {
    const before = (await pool.query('SELECT count(*) AS n FROM sessions')).rows[0].n;
    const guest = apiClient(app);
    await guest.get('/rates');
    expect((await pool.query('SELECT count(*) AS n FROM sessions')).rows[0].n).toBe(before);
  });

  it('при входе выдаётся новый CSRF-токен', async () => {
    const c = await createClientWithAccount(0, 'BYN', await hashPassword('Parol2026'));
    const client = apiClient(app);
    const guestToken = await client.refresh();
    await client.post('/login', { login: c.login, password: 'Parol2026' });
    const after = (await client.session()).csrfToken;
    expect(after).toBeTruthy();
    expect(after).not.toBe(guestToken);
  });
});

describe('поиск', () => {
  it('символы % и _ ищутся буквально', async () => {
    expect(likePattern('50%_')).toBe('%50\\%\\_%');
    const op = await staff('operator');
    const res = await op.api.get('/staff/accounts?q=%25%25');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
  });
});

describe('адрес клиента', () => {
  it('заголовок X-Forwarded-For не подменяет адрес без настройки TRUST_PROXY', async () => {
    const c = await createClientWithAccount(0, 'BYN', await hashPassword('Parol2026'));
    const client = apiClient(app);
    await client.refresh();
    const token = (await client.session()).csrfToken;
    await client.agent.post('/api/login').set('X-CSRF-Token', token)
      .set('X-Forwarded-For', '203.0.113.77').send({ login: c.login, password: 'Parol2026' });
    const { rows: [row] } = await pool.query("SELECT ip FROM audit_log WHERE user_id = ? AND action = 'auth.login' ORDER BY id DESC LIMIT 1", [c.userId]);
    expect(row.ip).not.toBe('203.0.113.77');
  });
});

describe('анкеты', () => {
  it('после отказа идентификационный номер освобождается для настоящего владельца', async () => {
    const n = String(1000000 + (Date.now() % 8000000)).slice(0, 7);
    const idNumber = `${n}B002PB3`;
    const first = await register(form(`fake${unique()}`, idNumber));
    await expect(register(form(`dup${unique()}`, idNumber))).rejects.toMatchObject({ fields: { idNumber: expect.any(String) } });
    const op = await staff('operator');
    await rejectClient(first.clientId, op.id, 'Документ не принадлежит заявителю');
    const owner = await register(form(`real${unique()}`, idNumber));
    expect(owner.clientId).toBeGreaterThan(first.clientId);
  });
});

describe('ограничение частоты запросов', () => {
  it('превышение отдаётся ошибкой API 429 с русским текстом', async () => {
    const express = (await import('express')).default;
    const { limiter } = await import('../../server/modules/auth/routes.js');
    const { errorHandler } = await import('../../server/shared/middleware/error-handler.js');
    const supertest = (await import('supertest')).default;
    const mini = express();
    mini.post('/x', limiter(60000, 2, 'Слишком много попыток', { skip: () => false }), (req, res) => res.json({ ok: true }));
    mini.use(errorHandler);
    await supertest(mini).post('/x').expect(200);
    await supertest(mini).post('/x').expect(200);
    const res = await supertest(mini).post('/x').expect(429);
    expect(res.body.error).toMatchObject({ code: 'rate_limited', message: 'Слишком много попыток' });
  });
});
