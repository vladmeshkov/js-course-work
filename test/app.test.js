import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { verifyClient } from '../src/services/kycService.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, closePool } from './helpers.js';
import { apiClient, loggedIn } from './http.js';

afterAll(closePool);

const app = createApp();

const validForm = (login) => ({
  lastName: 'Иванова', firstName: 'Анна', patronymic: 'Сергеевна', birthDate: '1995-04-12',
  idNumber: '3010590A001PB4', passport: 'MC1234567', phone: '+375291234567', email: 'anna@example.by',
  login, password: 'Parol2026', passwordRepeat: 'Parol2026'
});

describe('приложение и API', () => {
  it('отдаёт страницу приложения на любой адрес, API проверяет здоровье', async () => {
    for (const url of ['/', '/login', '/accounts/5', '/nigde']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.text).toContain('<main id="content"');
    }
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  });

  it('несуществующий метод API даёт JSON-ошибку на русском', async () => {
    const res = await request(app).get('/api/net-takogo');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'not_found', message: expect.stringContaining('не найден') });
  });

  it('статические файлы отдаются, отсутствующий файл не подменяется страницей', async () => {
    expect((await request(app).get('/css/style.css')).status).toBe(200);
    expect((await request(app).get('/js/app.js')).status).toBe(200);
    expect((await request(app).get('/js/net.js')).status).toBe(404);
  });

  it('сессия гостя: нет пользователя, есть меню и токен CSRF', async () => {
    const s = (await request(app).get('/api/session')).body;
    expect(s.user).toBeNull();
    expect(s.csrfToken).toMatch(/^[0-9a-f]{48}$/);
    expect(s.nav.map((i) => i.href)).toEqual(['/deposits', '/loans', '/rates']);
  });

  it('кабинет без входа даёт 401', async () => {
    const res = await request(app).get('/api/cabinet');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('заголовки безопасности: CSP без inline-скриптов и стилей', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
  });
});

describe('защита запросов', () => {
  it('POST без CSRF-токена отклоняется', async () => {
    const client = apiClient(app);
    await client.refresh();
    const res = await client.postWithoutToken('/login', { login: 'a', password: 'b' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf');
  });

  it('некорректный JSON даёт 400, а не ошибку сервера', async () => {
    const client = apiClient(app);
    await client.refresh();
    const res = await client.agent.post('/api/login').set('Content-Type', 'application/json').set('X-CSRF-Token', 'x').send('{oops');
    expect(res.status).toBe(400);
  });
});

describe('заявка клиента, проверка анкеты и вход', () => {
  it('проходит весь путь: заявка, верификация, вход, счёт в кабинете', async () => {
    const client = apiClient(app);
    await client.refresh();

    const bad = await client.post('/register', { ...validForm('ab'), idNumber: 'нет' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.idNumber).toContain('Идентификационный номер');

    const ok = await client.post('/register', validForm('anna.test'));
    expect(ok.status).toBe(201);

    const dup = await client.post('/register', validForm('anna.other'));
    expect(dup.status).toBe(422);
    expect(JSON.stringify(dup.body)).toContain('уже подавал заявку');

    // персональные данные в базе хранятся только в зашифрованном виде
    const { rows: [row] } = await pool.query("SELECT c.id, id_number_enc, passport_enc FROM clients c JOIN users u ON u.id = c.user_id WHERE u.login = 'anna.test'");
    expect(row.id_number_enc).not.toContain('3010590A001PB4');
    expect(row.passport_enc).not.toContain('MC1234567');

    const operatorHash = await hashPassword('Operator2026');
    const opId = await userModel.create(pool, { login: 'op.test', passwordHash: operatorHash, roleCode: 'operator' });
    await verifyClient(row.id, opId);

    const wrong = await client.login('anna.test', 'wrong');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toContain('Неверный логин или пароль');

    const login = await client.login('anna.test', 'Parol2026');
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ status: 'ok', welcome: true, home: '/cabinet' });

    const session = await client.session();
    expect(session.user).toMatchObject({ login: 'anna.test', roleCode: 'client' });
    expect(session.nav[0].href).toBe('/cabinet');

    const welcome = await client.get('/welcome');
    expect(welcome.body).toMatchObject({ shown: true, name: 'Анна' });
    expect((await client.get('/welcome')).body.shown).toBe(false);

    const cabinet = (await client.get('/cabinet')).body;
    expect(cabinet.client.first_name).toBe('Анна');
    expect(cabinet.accounts[0].title).toBe('Текущий счёт, BYN');

    const out = await client.post('/logout');
    expect(out.status).toBe(200);
    expect((await client.agent.get('/api/cabinet')).status).toBe(401);
  });

  it('после серии неудачных попыток вход блокируется', async () => {
    const hash = await hashPassword('Parol2026');
    await userModel.create(pool, { login: 'lock.test', passwordHash: hash, roleCode: 'client' });
    const client = apiClient(app);
    await client.refresh();
    for (let i = 0; i < 5; i++) await client.login('lock.test', 'bad');
    const res = await client.login('lock.test', 'Parol2026');
    expect(res.status).toBe(429);
  });

  it('клиент не открывает рабочее место сотрудника по прямой ссылке', async () => {
    const hash = await hashPassword('Parol2026');
    await userModel.create(pool, { login: 'plain.client', passwordHash: hash, roleCode: 'client' });
    const client = await loggedIn(app, 'plain.client');
    const res = await client.get('/workplace');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Недостаточно прав');
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
    expect((await pool.query('SELECT status FROM accounts WHERE id = ?', [usd.id])).rows[0].status).toBe('closed');
    // нельзя закрыть счёт с деньгами
    const rich = await createClientWithAccount(5000);
    await expect(closeForUser(rich.userId, rich.accountId)).rejects.toThrow(/нулевым остатком/);

    const rates = (await request(app).get('/api/rates')).body.rates;
    expect(rates.map((r) => r.currency)).toEqual(['USD', 'EUR', 'RUB', 'CNY']);
    const conv = await request(app).get('/api/rates/convert?from=USD&to=BYN&amount=100');
    expect(conv.body.ok).toBe(true);
    expect(conv.body.result).toBeGreaterThan(30000);
    expect((await request(app).get('/api/rates/convert?from=XXX&to=BYN&amount=1')).body.ok).toBe(false);
  });

  it('статические страницы и главная гостя', async () => {
    const home = (await request(app).get('/api/home')).body;
    expect(home.maxDepositRate).toBeGreaterThan(10);
    expect(home.rates.length).toBe(4);
    const info = await request(app).get('/api/info/privacy');
    expect(info.body.title).toBe('Политика конфиденциальности');
    expect((await request(app).get('/api/info/nope')).status).toBe(404);
  });
});

describe('главная страница клиента', () => {
  it('показывает сумму по счетам в BYN с учётом валют, последние операции и курсы', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(100000, 'BYN', hash);
    const { addAccount } = await import('./helpers.js');
    await addAccount(c.clientId, 'USD', 10000);
    const client = await loggedIn(app, c.login);
    const d = (await client.get('/cabinet')).body;
    // 1000 BYN + 100 USD по курсу Нацбанка 3,275
    expect(d.totalByn).toBe(100000 + Math.round(10000 * 3.275));
    expect(d.operations.length).toBeGreaterThan(0);
    expect(d.rates.map((r) => r.currency)).toEqual(expect.arrayContaining(['USD', 'EUR', 'RUB']));
    expect(d.maxDepositRate).toBeGreaterThan(10);
  });
});

describe('единая таблица стилей', () => {
  it('в клиентском коде нет встроенных стилей: их блокирует CSP и они нарушают требование одной таблицы стилей', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
    const files = [...(await walk(path.resolve('public/js'))), path.resolve('public/index.html')];
    for (const file of files.filter((f) => /\.(js|html)$/.test(f))) {
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toMatch(/\sstyle=["'`]/);
      expect(text, file).not.toMatch(/<style[\s>]/);
    }
  });

  it('страницы не используют шаблонизатор на сервере', async () => {
    const { readdir } = await import('node:fs/promises');
    expect(await readdir('src').then((l) => l.includes('views'))).toBe(false);
    const pkg = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8'));
    expect(Object.keys(pkg.dependencies)).not.toContain('ejs');
  });
});
