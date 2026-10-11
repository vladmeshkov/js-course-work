import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import * as settingsModel from '../src/models/settingsModel.js';
import * as settingsService from '../src/services/settingsService.js';
import * as adminService from '../src/services/adminService.js';
import { convert } from '../src/services/ratesService.js';
import { hashPassword } from '../src/services/authService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, closePool } from './helpers.js';

afterAll(closePool);

async function admin() {
  const hash = await hashPassword('Parol2026');
  const login = `adm${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = await userModel.create(pool, { login, passwordHash: hash, roleCode: 'admin' });
  return { id, login };
}

describe('тарифы и спред', () => {
  it('меняет настройки с переводом рублей в копейки и пишет в журнал', async () => {
    const a = await admin();
    const changed = await settingsService.update(a.id, { 'transfer.daily_limit': '7 500,50', 'transfer.fee_percent': '0,5' });
    expect(changed).toBe(2);
    expect(await settingsModel.getNumber('transfer.daily_limit')).toBe(750050);
    expect(await settingsModel.getNumber('transfer.fee_percent')).toBe(0.5);
    const groups = await settingsService.list();
    const item = groups.flatMap((g) => g.items).find((i) => i.key === 'transfer.daily_limit');
    expect(item.value).toBe('7500,5');
    const { rows } = await pool.query("SELECT details FROM audit_log WHERE action = 'settings.update' AND user_id = $1", [a.id]);
    expect(rows).toHaveLength(2);
    await settingsService.update(a.id, { 'transfer.daily_limit': '5000', 'transfer.fee_percent': '0' });
  });

  it('отклоняет неверные значения', async () => {
    const a = await admin();
    await expect(settingsService.update(a.id, { 'transfer.daily_limit': 'много', 'transfer.fee_percent': '99' }))
      .rejects.toMatchObject({ fields: { 'transfer.daily_limit': expect.any(String), 'transfer.fee_percent': expect.any(String) } });
  });

  it('изменение спреда сразу влияет на конвертацию', async () => {
    const a = await admin();
    const before = await convert({ from: 'USD', to: 'BYN', amount: 10000 });
    await settingsService.updateSpreads(a.id, { USD: { buy: '3', sell: '3' } });
    const after = await convert({ from: 'USD', to: 'BYN', amount: 10000 });
    expect(after).toBeLessThan(before);
    await settingsService.updateSpreads(a.id, { USD: { buy: '1,5', sell: '1,5' } });
    expect(await convert({ from: 'USD', to: 'BYN', amount: 10000 })).toBe(before);
    await expect(settingsService.updateSpreads(a.id, { USD: { buy: '-1', sell: '1' } })).rejects.toMatchObject({ fields: { USD_buy: expect.any(String) } });
  });
});

describe('пользователи и журнал', () => {
  it('блокирует и разблокирует, себя блокировать нельзя, заблокированный не входит', async () => {
    const a = await admin();
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(0, 'BYN', hash);
    await expect(adminService.setBlocked(a.id, a.id, true)).rejects.toThrow(/собственную/);
    await adminService.setBlocked(a.id, c.userId, true);
    const app = createApp();
    const agent = request.agent(app);
    const page = await agent.get('/login');
    const token = /name="_csrf" value="([0-9a-f]+)"/.exec(page.text)[1];
    const res = await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    expect(res.status).toBe(403);
    expect(res.text).toContain('заблокирована');
    await adminService.setBlocked(a.id, c.userId, false);
    const ok = await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    expect(ok.status).toBe(302);
  });

  it('создаёт сотрудника и меняет роль, клиента в сотрудники переводить нельзя', async () => {
    const a = await admin();
    const id = await adminService.createStaff(a.id, { login: `staff${Date.now()}`, password: 'Parol2026', roleCode: 'operator' });
    await adminService.changeRole(a.id, id, 'credit_officer');
    expect((await userModel.findById(id)).role_code).toBe('credit_officer');
    await expect(adminService.createStaff(a.id, { login: 'xx', password: '1', roleCode: 'client' })).rejects.toMatchObject({ fields: expect.any(Object) });
    const c = await createClientWithAccount(0);
    await expect(adminService.changeRole(a.id, c.userId, 'operator')).rejects.toThrow(/Клиента/);
  });

  it('журнал фильтруется и не допускает правок', async () => {
    const a = await admin();
    await adminService.setBlocked(a.id, (await createClientWithAccount(0)).userId, true);
    const rows = await adminService.auditLog({ login: a.login, action: 'user.block' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.action === 'user.block')).toBe(true);
    await expect(pool.query('DELETE FROM audit_log WHERE id = $1', [rows[0].id])).rejects.toThrow(/только добавление/);
  });

  it('страницы администратора открываются, клиенту они недоступны', async () => {
    const hash = await hashPassword('Parol2026');
    const login = `adm${Date.now()}x`;
    await userModel.create(pool, { login, passwordHash: hash, roleCode: 'admin' });
    const app = createApp();
    const agent = request.agent(app);
    const token = /name="_csrf" value="([0-9a-f]+)"/.exec((await agent.get('/login')).text)[1];
    await agent.post('/login').type('form').send({ _csrf: token, login, password: 'Parol2026' });
    for (const url of ['/admin/rates', '/admin/users', '/admin/audit', '/admin/eod', '/admin/reports', '/admin/reports?from=2026-01-01&to=2026-12-31&currency=USD', '/admin/reports/trial.csv', '/admin/backups', '/workplace']) expect((await agent.get(url)).status, url).toBe(200);

    const client = await createClientWithAccount(0, 'BYN', hash);
    const other = request.agent(app);
    const t2 = /name="_csrf" value="([0-9a-f]+)"/.exec((await other.get('/login')).text)[1];
    await other.post('/login').type('form').send({ _csrf: t2, login: client.login, password: 'Parol2026' });
    for (const url of ['/admin/rates', '/admin/users', '/admin/audit']) expect((await other.get(url)).status, url).toBe(403);
  });
});
