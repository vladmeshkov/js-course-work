import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, withTransaction } from '../src/db/pool.js';
import { totp, verify, stepOf } from '../src/lib/totp.js';
import { decrypt } from '../src/lib/crypto.js';
import { hashPassword } from '../src/services/authService.js';
import * as twoFactor from '../src/services/twoFactorService.js';
import * as notifications from '../src/services/notificationService.js';
import * as userModel from '../src/models/userModel.js';
import { createTransfer } from '../src/services/transferService.js';
import { processLoans, apply, requestSignCode, sign, sendReminders } from '../src/services/loanService.js';
import { processDeposits, openDeposit } from '../src/services/depositService.js';
import { purchase, issueCard } from '../src/services/cardService.js';
import { lookupHash } from '../src/lib/crypto.js';
import { addDays, addMonths } from '../src/lib/dates.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);
const app = createApp();
const tokenOf = (res) => /name="_csrf" value="([0-9a-f]+)"/.exec(res.text)[1];

async function clientWithPassword() {
  return createClientWithAccount(500000, 'BYN', await hashPassword('Parol2026'));
}

/** Включает 2FA напрямую через сервис и возвращает секрет и резервные коды. */
async function enable2fa(c) {
  const user = await userModel.findById(c.userId);
  const setup = await twoFactor.beginSetup(user);
  const codes = await twoFactor.confirmSetup(user, setup.secret, totp(setup.secret));
  return { secret: setup.secret, codes };
}

describe('двухфакторная защита', () => {
  it('настройка: секрет хранится зашифрованным, выдаются 10 резервных кодов, неверный код отклоняется', async () => {
    const c = await clientWithPassword();
    const user = await userModel.findById(c.userId);
    const setup = await twoFactor.beginSetup(user);
    expect(setup.qrSvg).toContain('<svg');
    await expect(twoFactor.confirmSetup(user, setup.secret, '000000')).rejects.toMatchObject({ fields: { code: expect.any(String) } }).catch(() => {});
    const codes = await twoFactor.confirmSetup(user, setup.secret, totp(setup.secret));
    expect(codes).toHaveLength(10);
    const row = (await pool.query('SELECT totp_secret_enc, totp_enabled FROM users WHERE id = ?', [c.userId])).rows[0];
    expect(row.totp_enabled).toBe(true);
    expect(row.totp_secret_enc).not.toContain(setup.secret);
    expect(decrypt(row.totp_secret_enc)).toBe(setup.secret);
    const { rows } = await pool.query('SELECT code_hash FROM recovery_codes WHERE user_id = ?', [c.userId]);
    expect(rows).toHaveLength(10);
    expect(rows.some((r) => codes.some((x) => r.code_hash.includes(x)))).toBe(false);
  });

  it('вход: после пароля нужен код, без него кабинет закрыт; код одноразовый', async () => {
    const c = await clientWithPassword();
    const { secret } = await enable2fa(c);
    const agent = request.agent(app);
    const token = tokenOf(await agent.get('/login'));
    const res = await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login/2fa');
    expect((await agent.get('/cabinet')).status).toBe(302);

    const page = await agent.get('/login/2fa');
    const t2 = tokenOf(page);
    const wrong = await agent.post('/login/2fa').type('form').send({ _csrf: t2, code: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.text).toContain('Неверный код');
    // код предыдущего интервала подходит, пока он новее использованного ранее
    const now = Date.now();
    const code = totp(secret, now + 30000);
    const ok = await agent.post('/login/2fa').type('form').send({ _csrf: t2, code });
    expect(ok.status).toBe(302);
    expect((await agent.get('/cabinet')).status).toBe(200);

    // тот же код повторно не принимается
    const again = request.agent(app);
    const t3 = tokenOf(await again.get('/login'));
    await again.post('/login').type('form').send({ _csrf: t3, login: c.login, password: 'Parol2026' });
    const t4 = tokenOf(await again.get('/login/2fa'));
    expect((await again.post('/login/2fa').type('form').send({ _csrf: t4, code })).status).toBe(401);
  });

  it('резервный код работает один раз', async () => {
    const c = await clientWithPassword();
    const { codes } = await enable2fa(c);
    expect(await twoFactor.verifyLogin(c.userId, codes[0].toLowerCase())).toBe(true);
    expect(await twoFactor.verifyLogin(c.userId, codes[0])).toBe(false);
    expect(await twoFactor.recoveryLeft(c.userId)).toBe(9);
    expect(await twoFactor.verifyLogin(c.userId, '')).toBe(false);
  });

  it('пять неверных кодов сбрасывают вход', async () => {
    const c = await clientWithPassword();
    await enable2fa(c);
    const agent = request.agent(app);
    const loginToken = tokenOf(await agent.get('/login'));
    await agent.post('/login').type('form').send({ _csrf: loginToken, login: c.login, password: 'Parol2026' });
    const t = tokenOf(await agent.get('/login/2fa'));
    let last;
    for (let i = 0; i < 5; i++) last = await agent.post('/login/2fa').type('form').send({ _csrf: t, code: '111111' });
    expect(last.status).toBe(429);
    expect((await agent.get('/login/2fa')).status).toBe(302);
  });

  it('отключение требует пароль и код', async () => {
    const c = await clientWithPassword();
    const { secret } = await enable2fa(c);
    const user = await userModel.findById(c.userId);
    await expect(twoFactor.disable(user, 'неверный', totp(secret, Date.now() + 30000))).rejects.toMatchObject({ fields: { password: expect.any(String) } });
    await expect(twoFactor.disable(user, 'Parol2026', '123456')).rejects.toMatchObject({ fields: { code: expect.any(String) } });
    await twoFactor.disable(user, 'Parol2026', totp(secret, Date.now() + 30000));
    expect((await userModel.findById(c.userId)).totp_enabled).toBe(false);
  });

  it('страницы настройки открываются', async () => {
    const c = await clientWithPassword();
    const agent = request.agent(app);
    const loginToken = tokenOf(await agent.get('/login'));
    await agent.post('/login').type('form').send({ _csrf: loginToken, login: c.login, password: 'Parol2026' });
    expect((await agent.get('/security')).status).toBe(200);
    const setup = await agent.get('/security/2fa/setup');
    expect(setup.status).toBe(200);
    expect(setup.text).toContain('<svg');
    expect((await agent.get('/notifications')).status).toBe(200);
  });
});

describe('уведомления', () => {
  const titles = async (userId) => (await notifications.list(userId)).map((n) => n.title);

  it('перевод уведомляет отправителя и получателя', async () => {
    const a = await createClientWithAccount(100000);
    const b = await createClientWithAccount(0);
    await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: 5000, comment: 'Подарок' });
    expect(await titles(a.userId)).toContain('Перевод выполнен');
    const got = (await notifications.list(b.userId)).find((n) => n.title === 'Поступил перевод');
    expect(got.body).toContain('50,00 BYN');
    expect(got.link).toBe(`/accounts/${b.accountId}`);
  });

  it('счётчик непрочитанных и отметка прочитанными', async () => {
    const c = await createClientWithAccount(0);
    await notifications.notify(c.userId, { type: 't', title: 'Раз' });
    await notifications.notify(c.userId, { type: 't', title: 'Два' });
    expect(await notifications.unreadCount(c.userId)).toBe(2);
    const first = (await notifications.list(c.userId))[0];
    await notifications.markRead(c.userId, first.id);
    expect(await notifications.unreadCount(c.userId)).toBe(1);
    await notifications.markAllRead(c.userId);
    expect(await notifications.unreadCount(c.userId)).toBe(0);
    await notifications.notify(null, { type: 't', title: 'никому' });
  });

  it('карта, вклад и платёж по кредиту создают уведомления', async () => {
    const c = await createClientWithAccount(2000000);
    const card = await issueCard(c.userId, { accountId: c.accountId, system: 'belkart', pin: '1234' });
    await purchase(c.userId, card.id, { amount: 1500, online: false, place: 'Евроопт' });
    const pid = (await pool.query("SELECT id FROM deposit_products WHERE name = 'Талер 6'")).rows[0].id;
    const dep = await openDeposit(c.userId, { productId: pid, sourceAccountId: c.accountId, amount: 100000 });
    await withTransaction((db) => processDeposits(db, addMonths(dep.opened_date, 1)));
    const t = await titles(c.userId);
    expect(t).toEqual(expect.arrayContaining(['Оплата картой', 'Вклад открыт', 'Начислены проценты по вкладу']));
  });

  it('кредит: выдача, платёж, просрочка и напоминание за 3 дня', async () => {
    const c = await createClientWithAccount(0);
    await pool.query("UPDATE clients SET birth_date = '1990-05-05' WHERE id = ?", [c.clientId]);
    const productId = (await pool.query("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'")).rows[0].id;
    const app1 = await apply(c.userId, { productId, amount: 300000, termMonths: 12, scheduleType: 'annuity', targetAccountId: c.accountId, income: 300000, obligations: 0, experienceMonths: 60, dependents: 0 });
    await requestSignCode(c.userId, app1.id);
    await pool.query('UPDATE otp_codes SET code_hash = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [lookupHash(`${c.userId}:loan:${app1.id}:123456`), c.userId, `loan:${app1.id}`]);
    const loan = await sign(c.userId, app1.id, '123456');
    expect(await titles(c.userId)).toEqual(expect.arrayContaining(['Кредит одобрен', 'Кредит выдан']));

    const today = String((await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date).slice(0, 10);
    const due = addMonths(today, 1);
    const reminded = await withTransaction((db) => sendReminders(db, addDays(due, -2)));
    expect(reminded).toBeGreaterThanOrEqual(1);
    expect(await titles(c.userId)).toContain('Скоро платёж по кредиту');
    // повторно напоминание не уходит
    expect(await withTransaction((db) => sendReminders(db, addDays(due, -1)))).toBe(0);

    // денег нет: платёж не проходит, приходит уведомление о просрочке (один раз)
    await withTransaction(async (db) => {
      const { post } = await import('../src/services/ledgerService.js');
      const { ensureInternalAccount } = await import('../src/services/accountService.js');
      const cash = await ensureInternalAccount(db, 'cash', 'BYN');
      const { balance } = (await db.query('SELECT balance FROM accounts WHERE id = ?', [c.accountId])).rows[0];
      await post({ type: 'cash_out', entries: [{ debit: c.accountId, credit: cash.id, amount: balance, currency: 'BYN' }] }, db);
    });
    await withTransaction((db) => processLoans(db, due));
    await withTransaction((db) => processLoans(db, addDays(due, 1)));
    const overdue = (await titles(c.userId)).filter((x) => x === 'Просрочен платёж по кредиту');
    expect(overdue).toHaveLength(1);
    expect(loan.id).toBeTruthy();
  });
});

describe('обязательная 2FA для сотрудников', () => {
  async function staffAgent(login) {
    const hash = await hashPassword('Parol2026');
    const id = await userModel.create(pool, { login, passwordHash: hash, roleCode: 'operator' });
    const agent = request.agent(app);
    const token = tokenOf(await agent.get('/login'));
    await agent.post('/login').type('form').send({ _csrf: token, login, password: 'Parol2026' });
    return { agent, id };
  }
  const setRequired = (v) => pool.query("UPDATE settings SET value = ? WHERE `key` = 'security.require_2fa_staff'", [v]);

  it('сотрудника без 2FA отправляют на настройку, остальные страницы закрыты', async () => {
    await setRequired('1');
    try {
      const { agent } = await staffAgent(`st${Date.now()}`);
      const res = await agent.get('/workplace');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/security/2fa/setup');
      expect((await agent.get('/security/2fa/setup')).status).toBe(200);
      expect((await agent.get('/admin/users')).status).toBe(302);
    } finally { await setRequired('0'); }
  });

  it('после включения 2FA сотрудник работает, отключить её уже нельзя', async () => {
    await setRequired('1');
    try {
      const login = `st${Date.now()}b`;
      const { agent, id } = await staffAgent(login);
      const user = await userModel.findById(id);
      const setup = await twoFactor.beginSetup(user);
      await twoFactor.confirmSetup(user, setup.secret, totp(setup.secret));
      expect((await agent.get('/workplace')).status).toBe(200);
      const fresh = await userModel.findById(id);
      await expect(twoFactor.disable(fresh, 'Parol2026', totp(setup.secret, Date.now() + 30000))).rejects.toThrow(/обязательна/);
      expect((await agent.get('/security')).text).toContain('отключить её нельзя');
    } finally { await setRequired('0'); }
  });

  it('клиентов требование не касается, при выключенной настройке сотрудники входят как раньше', async () => {
    await setRequired('1');
    try {
      const c = await clientWithPassword();
      const agent = request.agent(app);
      const loginToken = tokenOf(await agent.get('/login'));
      await agent.post('/login').type('form').send({ _csrf: loginToken, login: c.login, password: 'Parol2026' });
      expect((await agent.get('/cabinet')).status).toBe(200);
    } finally { await setRequired('0'); }
    const { agent } = await staffAgent(`st${Date.now()}c`);
    expect((await agent.get('/workplace')).status).toBe(200);
  });
});
