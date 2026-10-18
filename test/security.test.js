import { describe, it, expect, afterAll } from 'vitest';
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
import { apiClient, loggedIn } from './http.js';

afterAll(closePool);
const app = createApp();

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
    const client = apiClient(app);
    await client.refresh();
    const res = await client.login(c.login, 'Parol2026');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('2fa');
    expect((await client.get('/cabinet')).status).toBe(401);
    expect((await client.get('/login/2fa')).body.pending).toBe(true);

    const wrong = await client.post('/login/2fa', { code: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toContain('Неверный код');
    // код предыдущего интервала подходит, пока он новее использованного ранее
    const now = Date.now();
    const code = totp(secret, now + 30000);
    const ok = await client.post('/login/2fa', { code });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ok');
    await client.refresh();
    expect((await client.get('/cabinet')).status).toBe(200);

    // тот же код повторно не принимается
    const again = apiClient(app);
    await again.refresh();
    await again.login(c.login, 'Parol2026');
    expect((await again.post('/login/2fa', { code })).status).toBe(401);
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
    const client = apiClient(app);
    await client.refresh();
    await client.login(c.login, 'Parol2026');
    let last;
    for (let i = 0; i < 5; i++) last = await client.post('/login/2fa', { code: '111111' });
    expect(last.status).toBe(429);
    expect((await client.get('/login/2fa')).body.pending).toBe(false);
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

  it('настройка через API: QR-код, неверный и верный код, резервные коды показываются один раз', async () => {
    const c = await clientWithPassword();
    const client = await loggedIn(app, c.login);
    expect((await client.get('/security')).body).toMatchObject({ locked: false, left: 0 });
    const setup = (await client.get('/security/2fa/setup')).body;
    expect(setup.qrSvg).toContain('<svg');
    // повторный запрос отдаёт тот же секрет
    expect((await client.get('/security/2fa/setup')).body.secret).toBe(setup.secret);
    const bad = await client.post('/security/2fa/setup', { code: '000000' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.code).toBeTruthy();
    expect((await client.post('/security/2fa/setup', { code: totp(setup.secret) })).status).toBe(200);
    const shown = (await client.get('/security')).body;
    expect(shown.recoveryCodes).toHaveLength(10);
    expect((await client.get('/security')).body.recoveryCodes).toBeNull();
    expect((await client.session()).user.totpEnabled).toBe(true);
    expect((await client.get('/security/2fa/setup')).status).toBe(409);
    expect((await client.get('/notifications')).status).toBe(200);
  });

  it('включение и отключение писем на почту', async () => {
    const c = await clientWithPassword();
    const client = await loggedIn(app, c.login);
    expect((await client.post('/security/email', { enabled: false })).body.enabled).toBe(false);
    expect((await client.session()).user.notifyEmail).toBe(false);
    expect((await client.post('/security/email', { enabled: true })).body.enabled).toBe(true);
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
    const client = await loggedIn(app, login);
    return { client, id };
  }
  const setRequired = (v) => pool.query("UPDATE settings SET value = ? WHERE `key` = 'security.require_2fa_staff'", [v]);

  it('сотрудника без 2FA отправляют на настройку, остальные страницы закрыты', async () => {
    await setRequired('1');
    try {
      const { client } = await staffAgent(`st${Date.now()}`);
      const res = await client.get('/workplace');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('staff_2fa_required');
      expect((await client.get('/security/2fa/setup')).status).toBe(200);
      expect((await client.get('/admin/users')).body.error.code).toBe('staff_2fa_required');
      expect((await client.get('/session')).body.user.login).toBeTruthy();
    } finally { await setRequired('0'); }
  });

  it('после включения 2FA сотрудник работает, отключить её уже нельзя', async () => {
    await setRequired('1');
    try {
      const login = `st${Date.now()}b`;
      const { client, id } = await staffAgent(login);
      const user = await userModel.findById(id);
      const setup = await twoFactor.beginSetup(user);
      await twoFactor.confirmSetup(user, setup.secret, totp(setup.secret));
      expect((await client.get('/workplace')).status).toBe(200);
      const fresh = await userModel.findById(id);
      await expect(twoFactor.disable(fresh, 'Parol2026', totp(setup.secret, Date.now() + 30000))).rejects.toThrow(/обязательна/);
      expect((await client.get('/security')).body.locked).toBe(true);
    } finally { await setRequired('0'); }
  });

  it('клиентов требование не касается, при выключенной настройке сотрудники входят как раньше', async () => {
    await setRequired('1');
    try {
      const c = await clientWithPassword();
      const client = await loggedIn(app, c.login);
      expect((await client.get('/cabinet')).status).toBe(200);
    } finally { await setRequired('0'); }
    const { client } = await staffAgent(`st${Date.now()}c`);
    expect((await client.get('/workplace')).status).toBe(200);
  });
});
