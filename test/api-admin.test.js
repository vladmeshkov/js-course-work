import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, closePool } from './helpers.js';
import { apiClient, loggedIn } from './http.js';

const app = createApp();
let backupDir;
let admin;
let adminId;

async function makeUser(prefix, roleCode) {
  const login = `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = await userModel.create(pool, { login, passwordHash: await hashPassword('Parol2026'), roleCode });
  return { id, login };
}

beforeAll(async () => {
  backupDir = await mkdtemp(path.join(os.tmpdir(), 'taler-api-backup-'));
  config.backup.dir = backupDir;
  const a = await makeUser('apiadm', 'admin');
  adminId = a.id;
  admin = await loggedIn(app, a.login);
});

afterAll(async () => {
  await rm(backupDir, { recursive: true, force: true });
  await closePool();
});

describe('права доступа к администрированию', () => {
  const GET = ['/admin/rates', '/admin/users', '/admin/audit', '/admin/backups', '/admin/reports', '/admin/reports/trial.csv', '/admin/clearing', '/admin/eod'];
  const POST = ['/admin/rates/spreads', '/admin/rates/refresh', '/admin/rates/settings', '/admin/users', '/admin/users/1/block', '/admin/users/1/role', '/admin/backups', '/admin/backups/restore', '/admin/eod'];

  it('гость получает 401 на каждом методе', async () => {
    const guest = apiClient(app);
    await guest.refresh();
    for (const url of GET) expect((await guest.get(url)).status, url).toBe(401);
    for (const url of POST) expect((await guest.post(url)).status, url).toBe(401);
  });

  it('клиент и сотрудник без права получают 403', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(0, 'BYN', hash);
    const operator = await makeUser('apiop', 'operator');
    for (const who of [await loggedIn(app, c.login), await loggedIn(app, operator.login)]) {
      for (const url of GET) expect((await who.get(url)).status, url).toBe(403);
      for (const url of POST) expect((await who.post(url)).status, url).toBe(403);
    }
  });

  it('у кредитного специалиста есть только право на отчёты', async () => {
    const officer = await loggedIn(app, (await makeUser('apicr', 'credit_officer')).login);
    expect((await officer.get('/admin/reports')).status).toBe(200);
    expect((await officer.get('/admin/reports/trial.csv')).status).toBe(200);
    for (const url of ['/admin/rates', '/admin/users', '/admin/audit', '/admin/backups', '/admin/clearing', '/admin/eod']) expect((await officer.get(url)).status, url).toBe(403);
  });
});

describe('курсы и тарифы', () => {
  it('отдаёт спреды по валютам и настройки по группам', async () => {
    const res = await admin.get('/admin/rates');
    expect(res.status).toBe(200);
    expect(res.body.spreads.map((s) => s.currency)).toEqual(['CNY', 'EUR', 'RUB', 'USD']);
    expect(res.body.spreads[0]).toMatchObject({ buy_percent: expect.any(Number), sell_percent: expect.any(Number), scale: expect.any(Number) });
    const items = res.body.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'transfer.daily_limit')).toMatchObject({ label: expect.any(String), unit: 'BYN', value: expect.any(String) });
  });

  it('сохраняет спред и возвращает обновлённые данные', async () => {
    const before = (await admin.get('/admin/rates')).body.spreads.find((s) => s.currency === 'USD');
    const res = await admin.post('/admin/rates/spreads', { USD_buy: '2,5', USD_sell: '3' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Спред сохранён');
    expect(res.body.spreads.find((s) => s.currency === 'USD')).toMatchObject({ buy_percent: 2.5, sell_percent: 3 });
    await admin.post('/admin/rates/spreads', { USD_buy: String(before.buy_percent), USD_sell: String(before.sell_percent) });
  });

  it('неверный спред даёт 422 с ключами полей, как в форме', async () => {
    const res = await admin.post('/admin/rates/spreads', { USD_buy: '-1', USD_sell: '1', EUR_buy: '1', EUR_sell: '50' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['EUR_sell', 'USD_buy']);
  });

  it('сохраняет настройки лимитов и сообщает число изменений', async () => {
    const res = await admin.post('/admin/rates/settings', { 'transfer.daily_limit': '7 500,50', 'transfer.fee_percent': '0,5' });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(2);
    expect(res.body.message).toBe('Сохранено изменений: 2');
    const item = res.body.groups.flatMap((g) => g.items).find((i) => i.key === 'transfer.daily_limit');
    expect(item.value).toBe('7500,5');
    const same = await admin.post('/admin/rates/settings', { 'transfer.daily_limit': '7500,5', 'transfer.fee_percent': '0,5' });
    expect(same.body).toMatchObject({ changed: 0, message: 'Изменений нет' });
    await admin.post('/admin/rates/settings', { 'transfer.daily_limit': '5000', 'transfer.fee_percent': '0' });
  });

  it('неверные значения настроек дают 422 с ключами настроек', async () => {
    const res = await admin.post('/admin/rates/settings', { 'transfer.daily_limit': 'много', 'transfer.fee_percent': '99' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toMatchObject({ 'transfer.daily_limit': expect.any(String), 'transfer.fee_percent': expect.any(String) });
  });

  it('обновление курсов Нацбанка: при недоступном сайте остаются запасные курсы', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    try {
      const res = await admin.post('/admin/rates/refresh');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ source: 'fallback', level: 'info', message: expect.stringContaining('Нацбанк недоступен') });
      expect(res.body.spreads).toHaveLength(4);
    } finally {
      vi.unstubAllGlobals();
    }
    const { rows } = await pool.query("SELECT 1 FROM audit_log WHERE action = 'rates.refresh' AND user_id = ?", [adminId]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('изменение спреда пишется в журнал аудита', async () => {
    await admin.post('/admin/rates/spreads', { RUB_buy: '1,5', RUB_sell: '1,5' });
    const log = (await admin.get('/admin/audit?action=rates.spread')).body;
    expect(log.rows.length).toBeGreaterThan(0);
    expect(log.rows.every((r) => r.action === 'rates.spread')).toBe(true);
  });
});

describe('пользователи и роли', () => {
  it('создаёт сотрудника, дубль логина и слабый пароль дают 422', async () => {
    const login = `newstaff${Date.now()}`;
    const res = await admin.post('/admin/users', { login, password: 'Parol2026', roleCode: 'operator' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ok', id: expect.any(Number) });
    const created = await userModel.findById(res.body.id);
    expect(created).toMatchObject({ login, role_code: 'operator' });
    // новый сотрудник входит со своим паролем
    expect((await loggedIn(app, login)).agent).toBeDefined();

    const dup = await admin.post('/admin/users', { login, password: 'Parol2026', roleCode: 'operator' });
    expect(dup.status).toBe(422);
    expect(dup.body.error.fields.login).toContain('занят');

    const bad = await admin.post('/admin/users', { login: 'x', password: '1', roleCode: 'client' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['login', 'password', 'roleCode']));
  });

  it('список ищется по логину и фильтруется по роли', async () => {
    const staff = await makeUser('findme', 'monitoring');
    const all = (await admin.get('/admin/users')).body;
    expect(all.roles.map((r) => r.code)).toEqual(expect.arrayContaining(['client', 'operator', 'admin']));
    expect(all.users.length).toBeGreaterThan(0);

    const byLogin = (await admin.get(`/admin/users?q=${staff.login.slice(0, 12).toUpperCase()}`)).body;
    expect(byLogin.users.map((u) => u.login)).toContain(staff.login);
    expect(byLogin.users[0]).toMatchObject({ role_name: expect.any(String), status: 'active' });
    expect(byLogin.users[0]).not.toHaveProperty('password_hash');

    const byRole = (await admin.get('/admin/users?role=monitoring')).body;
    expect(byRole.role).toBe('monitoring');
    expect(byRole.users.length).toBeGreaterThan(0);
    expect(byRole.users.every((u) => u.role_code === 'monitoring')).toBe(true);
    const both = (await admin.get(`/admin/users?role=admin&q=${staff.login}`)).body;
    expect(both.users).toHaveLength(0);
  });

  it('блокирует и разблокирует, заблокированный не входит, себя блокировать нельзя', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(0, 'BYN', hash);
    const blocked = await admin.post(`/admin/users/${c.userId}/block`, { action: 'block' });
    expect(blocked.status).toBe(200);
    expect(blocked.body).toMatchObject({ blocked: true, message: 'Пользователь заблокирован' });
    const guest = apiClient(app);
    await guest.refresh();
    const denied = await guest.login(c.login, 'Parol2026');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('blocked');
    expect((await admin.get(`/admin/users?q=${c.login}`)).body.users[0].status).toBe('blocked');

    const open = await admin.post(`/admin/users/${c.userId}/block`, { action: 'unblock' });
    expect(open.body).toMatchObject({ blocked: false, message: 'Пользователь разблокирован' });
    expect((await guest.login(c.login, 'Parol2026')).status).toBe(200);

    const self = await admin.post(`/admin/users/${adminId}/block`, { action: 'block' });
    expect(self.status).toBe(409);
    expect((await admin.post('/admin/users/99999999/block', { action: 'block' })).status).toBe(404);
  });

  it('меняет роль сотрудника, клиента и себя менять нельзя', async () => {
    const staff = await makeUser('rolechg', 'operator');
    const res = await admin.post(`/admin/users/${staff.id}/role`, { roleCode: 'credit_officer' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Роль изменена');
    expect((await userModel.findById(staff.id)).role_code).toBe('credit_officer');

    expect((await admin.post(`/admin/users/${staff.id}/role`, { roleCode: 'net_takoi' })).status).toBe(422);
    const c = await createClientWithAccount(0);
    expect((await admin.post(`/admin/users/${c.userId}/role`, { roleCode: 'operator' })).status).toBe(409);
    expect((await admin.post(`/admin/users/${adminId}/role`, { roleCode: 'operator' })).status).toBe(409);
  });

  it('права меняются сразу: сотрудник с новой ролью получает доступ к разделу', async () => {
    const staff = await makeUser('perm', 'operator');
    const session = await loggedIn(app, staff.login);
    expect((await session.get('/admin/audit')).status).toBe(403);
    await admin.post(`/admin/users/${staff.id}/role`, { roleCode: 'admin' });
    expect((await session.get('/admin/audit')).status).toBe(200);
  });
});

describe('журнал аудита', () => {
  it('фильтруется по пользователю, событию, результату и периоду', async () => {
    const target = await makeUser('audtarget', 'operator');
    await admin.post(`/admin/users/${target.id}/block`, { action: 'block' });
    await admin.post(`/admin/users/${target.id}/block`, { action: 'unblock' });

    const all = await admin.get('/admin/audit');
    expect(all.status).toBe(200);
    expect(all.body.filters).toEqual({ login: '', action: '', result: '', days: 0 });
    expect(all.body.rows[0]).toMatchObject({ id: expect.any(Number), action: expect.any(String), result: expect.any(String) });
    expect(all.body.rows[0].id).toBeGreaterThan(all.body.rows.at(-1).id);

    const byAction = (await admin.get('/admin/audit?action=user.block')).body;
    expect(byAction.rows.length).toBeGreaterThan(0);
    expect(byAction.rows.every((r) => r.action === 'user.block')).toBe(true);

    const byLogin = (await admin.get('/admin/audit?login=apiadm&action=user.')).body;
    expect(byLogin.rows.length).toBeGreaterThan(0);
    expect(byLogin.rows.every((r) => r.login.includes('apiadm') && r.action.startsWith('user.'))).toBe(true);

    expect((await admin.get('/admin/audit?result=failure&login=apiadm')).body.rows.every((r) => r.result === 'failure')).toBe(true);
    expect((await admin.get('/admin/audit?result=success&action=user.unblock')).body.rows.every((r) => r.result === 'success')).toBe(true);

    const day = (await admin.get('/admin/audit?days=1&action=user.block')).body;
    expect(day.filters.days).toBe(1);
    expect(day.rows.length).toBeGreaterThan(0);
    // произвольный период не принимается
    expect((await admin.get('/admin/audit?days=500')).body.filters.days).toBe(0);
    expect((await admin.get('/admin/audit?login=net-takogo-polzovatelya')).body.rows).toHaveLength(0);
  });
});

describe('резервные копии', () => {
  it('создаёт копию, показывает в списке и восстанавливает базу', async () => {
    expect((await admin.get('/admin/backups')).body.backups).toEqual([]);
    await pool.query("INSERT INTO settings (`key`, value, description) VALUES ('test.api_marker', 'до копии', 'тест') ON DUPLICATE KEY UPDATE value = 'до копии'");

    const created = await admin.post('/admin/backups');
    expect(created.status).toBe(201);
    expect(created.body.backup).toMatchObject({ name: expect.stringMatching(/^talerbank-.+\.sql\.enc$/), size: expect.any(Number) });
    expect(created.body.message).toContain(created.body.backup.name);

    const list = (await admin.get('/admin/backups')).body.backups;
    expect(list.map((b) => b.name)).toContain(created.body.backup.name);
    expect(list[0]).toMatchObject({ size: expect.any(Number), createdAt: expect.any(String) });

    await pool.query("UPDATE settings SET value = 'после копии' WHERE `key` = 'test.api_marker'");
    const name = created.body.backup.name;

    const noWord = await admin.post('/admin/backups/restore', { name, confirm: 'да' });
    expect(noWord.status).toBe(422);
    expect(noWord.body.error.fields.confirm).toContain('ВОССТАНОВИТЬ');
    expect((await pool.query("SELECT value FROM settings WHERE `key` = 'test.api_marker'")).rows[0].value).toBe('после копии');

    const restored = await admin.post('/admin/backups/restore', { name, confirm: 'ВОССТАНОВИТЬ' });
    expect(restored.status).toBe(200);
    expect(restored.body.message).toBe('База данных восстановлена из копии');
    expect((await pool.query("SELECT value FROM settings WHERE `key` = 'test.api_marker'")).rows[0].value).toBe('до копии');
    await pool.query("DELETE FROM settings WHERE `key` = 'test.api_marker'");

    // сессия администратора после восстановления работает
    expect((await admin.get('/admin/backups')).status).toBe(200);
  }, 60000);

  it('отклоняет чужое имя и отсутствующую копию', async () => {
    expect((await admin.post('/admin/backups/restore', { name: '../../etc/passwd', confirm: 'ВОССТАНОВИТЬ' })).status).toBe(400);
    expect((await admin.post('/admin/backups/restore', { name: 'talerbank-2020-01-01T00-00-00.sql.enc', confirm: 'ВОССТАНОВИТЬ' })).status).toBe(404);
  });
});

describe('отчёты', () => {
  it('отдаёт ведомость и показатели портфеля', async () => {
    const res = await admin.get('/admin/reports');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('BYN');
    expect(res.body.trial).toMatchObject({ balanced: true, from: expect.stringMatching(/^\d{4}-\d{2}-01$/), to: expect.any(String) });
    expect(res.body.trial.total).toMatchObject({ opening: 0, closing: 0 });
    expect(res.body.portfolio.loans).toMatchObject({ count: expect.any(Number), buckets: expect.any(Array) });
    expect(res.body.portfolio.operations.byType).toBeInstanceOf(Array);
  });

  it('учитывает период и валюту, неизвестная валюта заменяется на BYN', async () => {
    const usd = (await admin.get('/admin/reports?from=2000-01-01&to=2999-12-31&currency=USD')).body;
    expect(usd.currency).toBe('USD');
    expect(usd.trial).toMatchObject({ from: '2000-01-01', to: '2999-12-31', currency: 'USD' });
    expect((await admin.get('/admin/reports?currency=XXX')).body.currency).toBe('BYN');
  });

  it('неверный период даёт 422 с полем from', async () => {
    const res = await admin.get('/admin/reports?from=2026-12-01&to=2026-01-01');
    expect(res.status).toBe(422);
    expect(res.body.error.fields.from).toContain('позже');
    expect((await admin.get('/admin/reports?from=вчера')).body.error.fields.from).toContain('ГГГГ-ММ-ДД');
  });

  it('скачивание CSV: вложение с разделителем «;» и итоговой строкой', async () => {
    await createClientWithAccount(1000);
    const res = await admin.get('/admin/reports/trial.csv?from=2000-01-01&to=2999-12-31&currency=BYN');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="osv-2999-12-31.csv"');
    expect(res.text.startsWith('﻿"Счёт";"Название"')).toBe(true);
    expect(res.text).toContain('"Итого"');
    expect(res.text).toContain('"2400"');
    expect((await admin.get('/admin/reports/trial.csv?from=2026-12-01&to=2026-01-01')).status).toBe(422);
  });
});

describe('клиринг и закрытие дня', () => {
  it('клиринг: очередь, пакеты и банки-контрагенты', async () => {
    const res = await admin.get('/admin/clearing');
    expect(res.status).toBe(200);
    expect(res.body.queue).toBeInstanceOf(Array);
    expect(res.body.batches).toBeInstanceOf(Array);
    expect(res.body.banks.length).toBeGreaterThan(0);
    expect(res.body.banks[0]).toMatchObject({ code: expect.any(String), name: expect.any(String), bic: expect.any(String), active: expect.any(Boolean) });
  });

  it('показывает дату и контроль двойной записи, закрывает день и несколько дней подряд', async () => {
    const before = (await admin.get('/admin/eod')).body;
    expect(before.bankDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(before.balance.length).toBeGreaterThan(0);
    expect(before.balance.every((b) => b.ok === true && b.net === 0)).toBe(true);

    const one = await admin.post('/admin/eod', { days: 1 });
    expect(one.status).toBe(200);
    const day = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
    expect(one.body.bankDate).toBe(day(before.bankDate, 1));
    expect(one.body.message).toBe(`Операционный день закрыт, новая банковская дата: ${one.body.bankDate}`);
    expect(one.body).toMatchObject({ date: one.body.bankDate, deposits: expect.any(Object), loans: expect.any(Object), clearing: expect.any(Object) });
    expect(one.body.balance.every((b) => b.ok)).toBe(true);

    const three = await admin.post('/admin/eod', { days: 3 });
    expect(three.body.bankDate).toBe(day(before.bankDate, 4));
    expect((await admin.get('/admin/eod')).body.bankDate).toBe(three.body.bankDate);

    // число дней ограничено снизу, пустое значение означает один день
    expect((await admin.post('/admin/eod', { days: 0 })).body.bankDate).toBe(day(before.bankDate, 5));
    expect((await admin.post('/admin/eod', {})).body.bankDate).toBe(day(before.bankDate, 6));
    const { rows } = await pool.query("SELECT 1 FROM audit_log WHERE action = 'eod.close_day' AND user_id = ?", [adminId]);
    expect(rows.length).toBe(6);
  });
});

describe('защита запросов', () => {
  it('изменяющий запрос без токена CSRF отклоняется', async () => {
    const res = await admin.postWithoutToken('/admin/backups');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf');
  });

  it('данные настроек доступны по тому же адресу без префикса старых страниц', async () => {
    const res = await request(app).get('/admin/rates');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<main id="content"');
  });
});
