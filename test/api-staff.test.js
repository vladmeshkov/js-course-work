import { describe, it, expect, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { register, hashPassword } from '../src/services/authService.js';
import { createTransfer } from '../src/services/transferService.js';
import * as userModel from '../src/models/userModel.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';
import { apiClient, loggedIn } from './http.js';

afterAll(closePool);

const app = createApp();
let seq = 0;
const unique = () => `${Date.now() % 1000000}${++seq}`;

/** Сотрудник нужной роли, уже вошедший в систему. */
async function staff(roleCode) {
  const login = `${roleCode.slice(0, 4)}${unique()}`;
  await userModel.create(pool, { login, passwordHash: await hashPassword('Parol2026'), roleCode });
  return loggedIn(app, login, 'Parol2026');
}

/** Клиент, подавший анкету (статус «на проверке»). */
async function applicant() {
  const n = Number(unique()) % 90000 + 10000;
  const login = `kyc${n}${++seq}`;
  const { clientId } = await register({
    login, password: 'Parol2026', passwordRepeat: 'Parol2026', lastName: 'Сидоров', firstName: 'Пётр', birthDate: '1990-02-02',
    idNumber: `${String(1000000 + n).slice(0, 7)}A001PB1`, passport: 'MC1112223', phone: '+375291112244'
  });
  return { clientId, login };
}

/** Клиент со счётом и входом в систему (для проверки доступа). */
async function loggedClient() {
  const c = await createClientWithAccount(0, 'BYN', await hashPassword('Parol2026'));
  return { ...c, api: await loggedIn(app, c.login, 'Parol2026') };
}

const ibanOf = async (id) => (await getAccount(id)).iban;

describe('API: проверка анкет', () => {
  it('очередь, просмотр с расшифровкой и подтверждение открывают счёт', async () => {
    const op = await staff('operator');
    const a = await applicant();
    const queue = (await op.get('/staff/kyc')).body.clients;
    expect(queue.find((c) => c.id === a.clientId)).toMatchObject({ login: a.login, last_name: 'Сидоров' });

    const view = await op.get(`/staff/kyc/${a.clientId}`);
    expect(view.status).toBe(200);
    expect(view.body.client).toMatchObject({ lastName: 'Сидоров', passport: 'MC1112223', kycStatus: 'submitted' });
    expect(view.body.client.idNumber).toMatch(/A001PB1$/);
    expect(JSON.stringify(view.body)).not.toContain('passport_enc');

    const res = await op.post(`/staff/kyc/${a.clientId}`, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', decision: 'approve' });
    const { rows } = await pool.query("SELECT kyc_status FROM clients WHERE id = ?", [a.clientId]);
    expect(rows[0].kyc_status).toBe('verified');
    const { rows: accounts } = await pool.query('SELECT currency FROM accounts WHERE owner_client_id = ?', [a.clientId]);
    expect(accounts.map((x) => x.currency)).toEqual(['BYN']);

    expect((await op.get('/staff/kyc')).body.clients.some((c) => c.id === a.clientId)).toBe(false);
    expect((await op.get(`/staff/kyc/${a.clientId}`)).body.client.kycStatus).toBe('verified');
    const again = await op.post(`/staff/kyc/${a.clientId}`, { decision: 'approve' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/уже верифицирован/);
  });

  it('отказ требует комментарий, причина доходит до клиента', async () => {
    const op = await staff('operator');
    const a = await applicant();
    const empty = await op.post(`/staff/kyc/${a.clientId}`, { decision: 'reject', comment: '  ' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.fields.comment).toMatch(/причину/);
    const res = await op.post(`/staff/kyc/${a.clientId}`, { decision: 'reject', comment: 'Паспорт нечитаем' });
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('reject');
    const { rows } = await pool.query('SELECT kyc_status, kyc_comment FROM clients WHERE id = ?', [a.clientId]);
    expect(rows[0]).toMatchObject({ kyc_status: 'rejected', kyc_comment: 'Паспорт нечитаем' });
  });

  it('несуществующая анкета даёт 404', async () => {
    const op = await staff('operator');
    const res = await op.get('/staff/kyc/99999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('API: касса', () => {
  it('взнос и выдача меняют остаток, ошибки дают понятные ответы', async () => {
    const op = await staff('operator');
    const c = await createClientWithAccount(0);
    const iban = await ibanOf(c.accountId);

    const dep = await op.post('/staff/cash', { direction: 'in', iban, amount: '500,00' });
    expect(dep.status).toBe(200);
    expect(dep.body).toMatchObject({ status: 'ok', direction: 'in', amount: 50000, currency: 'BYN', message: 'Наличные внесены на счёт' });
    expect((await getAccount(c.accountId)).balance).toBe(50000);

    const out = await op.post('/staff/cash', { direction: 'out', iban, amount: '200' });
    expect(out.status).toBe(200);
    expect(out.body.message).toBe('Наличные выданы');
    expect((await getAccount(c.accountId)).balance).toBe(30000);

    const tooMuch = await op.post('/staff/cash', { direction: 'out', iban, amount: '999,99' });
    expect(tooMuch.status).toBeGreaterThanOrEqual(400);
    expect(tooMuch.status).toBeLessThan(500);
    expect(tooMuch.body.error.message).toBeTruthy();
    expect((await getAccount(c.accountId)).balance).toBe(30000);

    const badIban = await op.post('/staff/cash', { direction: 'in', iban: 'BY00', amount: '10' });
    expect(badIban.status).toBe(422);
    expect(badIban.body.error.fields.iban).toBeTruthy();

    const badAmount = await op.post('/staff/cash', { direction: 'in', iban, amount: 'много' });
    expect(badAmount.status).toBe(422);
    expect(badAmount.body.error.fields.amount).toMatch(/сумму/);

    const zero = await op.post('/staff/cash', { direction: 'in', iban, amount: '0' });
    expect(zero.status).toBe(422);
    expect(zero.body.error.fields.amount).toBeTruthy();

    const badDirection = await op.post('/staff/cash', { direction: 'sideways', iban, amount: '10' });
    expect(badDirection.status).toBe(422);
    expect(badDirection.body.error.fields.direction).toBeTruthy();
  });
});

describe('API: входящие платежи', () => {
  it('справочник банков и зачисление на счёт клиента', async () => {
    const op = await staff('operator');
    const banks = (await op.get('/staff/incoming')).body.banks;
    expect(banks.length).toBeGreaterThan(0);
    expect(banks[0]).toMatchObject({ code: expect.any(String), name: expect.any(String) });

    const c = await createClientWithAccount(0);
    const iban = await ibanOf(c.accountId);
    const res = await op.post('/staff/incoming', { bankCode: banks[0].code, name: 'ООО Ромашка', iban, amount: '120,50', purpose: 'Оплата по договору' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ok', id: expect.any(Number) });
    expect((await getAccount(c.accountId)).balance).toBe(12050);
  });

  it('неверные данные дают 422 с полями', async () => {
    const op = await staff('operator');
    const res = await op.post('/staff/incoming', { bankCode: 'XXXX', name: 'ab', iban: 'BY00', amount: '10' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['bankCode', 'iban', 'name']);
    const noAmount = await op.post('/staff/incoming', { bankCode: 'XXXX', name: 'ООО Ромашка', iban: 'BY00', amount: '' });
    expect(noAmount.status).toBe(422);
    expect(noAmount.body.error.fields.amount).toBeTruthy();
  });
});

describe('API: блокировка счетов', () => {
  it('поиск, блокировка с основанием и разблокировка', async () => {
    const op = await staff('operator');
    const c = await createClientWithAccount(10000);
    const iban = await ibanOf(c.accountId);

    expect((await op.get('/staff/accounts')).body).toEqual({ q: '', accounts: [] });
    const found = (await op.get(`/staff/accounts?q=${c.login}`)).body;
    expect(found.q).toBe(c.login);
    expect(found.accounts[0]).toMatchObject({ id: c.accountId, iban, status: 'open', balance: 10000, login: c.login });

    const noReason = await op.post(`/staff/accounts/${c.accountId}/freeze`, { action: 'freeze', reason: '' });
    expect(noReason.status).toBe(409);
    expect(noReason.body.error.message).toMatch(/основание/);

    const frozen = await op.post(`/staff/accounts/${c.accountId}/freeze`, { action: 'freeze', reason: 'Решение суда № 12' });
    expect(frozen.status).toBe(200);
    expect(frozen.body).toMatchObject({ frozen: true, message: 'Счёт заблокирован' });
    expect((await getAccount(c.accountId)).status).toBe('frozen');
    expect((await op.get(`/staff/accounts?q=${iban}`)).body.accounts[0].status).toBe('frozen');

    const open = await op.post(`/staff/accounts/${c.accountId}/freeze`, { action: 'unfreeze' });
    expect(open.status).toBe(200);
    expect(open.body).toMatchObject({ frozen: false, message: 'Счёт разблокирован' });
    expect((await getAccount(c.accountId)).status).toBe('open');
  });

  it('несуществующий счёт нельзя заблокировать', async () => {
    const op = await staff('operator');
    const res = await op.post('/staff/accounts/99999999/freeze', { action: 'freeze', reason: 'Проверка' });
    expect(res.status).toBe(409);
  });
});

describe('API: антифрод', () => {
  /** Задержанный крупный перевод новому получателю. */
  async function heldTransfer() {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 400000 });
    expect(r.review).toBe(true);
    const { rows: [fraudCase] } = await pool.query('SELECT id FROM fraud_cases WHERE intent_id = ?', [r.intent.id]);
    return { a, b, caseId: fraudCase.id };
  }

  it('очередь и карточка случая, одобрение проводит перевод', async () => {
    const monitor = await staff('monitoring');
    const { a, b, caseId } = await heldTransfer();

    const list = (await monitor.get('/staff/fraud')).body;
    expect(list.cases.find((c) => c.id === caseId)).toMatchObject({ amount: 400000, currency: 'BYN', interbank: false });
    expect(Array.isArray(list.special)).toBe(true);

    const view = (await monitor.get(`/staff/fraud/${caseId}`)).body.fraudCase;
    expect(view).toMatchObject({ id: caseId, status: 'open', amount: 400000, interbank: false });
    expect(view.score).toBeGreaterThanOrEqual(60);
    expect(view.reasons.length).toBeGreaterThan(0);
    expect(view.reasons[0]).toMatchObject({ text: expect.any(String), points: expect.any(Number) });

    const res = await monitor.post(`/staff/fraud/${caseId}`, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', decision: 'approve', message: 'Перевод одобрен' });
    expect((await getAccount(a.accountId)).balance).toBe(1600000);
    expect((await getAccount(b.accountId)).balance).toBe(400000);
    expect((await monitor.get(`/staff/fraud/${caseId}`)).body.fraudCase.status).toBe('approved');
    expect((await monitor.get('/staff/fraud')).body.cases.some((c) => c.id === caseId)).toBe(false);

    const again = await monitor.post(`/staff/fraud/${caseId}`, { decision: 'approve' });
    expect(again.status).toBe(409);
  });

  it('отказ требует комментарий и разблокирует деньги', async () => {
    const monitor = await staff('monitoring');
    const { a, b, caseId } = await heldTransfer();
    const empty = await monitor.post(`/staff/fraud/${caseId}`, { decision: 'reject', comment: '' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.fields.comment).toBeTruthy();
    const res = await monitor.post(`/staff/fraud/${caseId}`, { decision: 'reject', comment: 'Подозрение на мошенничество' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ decision: 'reject', message: 'Перевод отклонён, деньги разблокированы' });
    expect((await getAccount(a.accountId)).balance).toBe(2000000);
    expect((await getAccount(b.accountId)).balance).toBe(0);
    expect((await monitor.get(`/staff/fraud/${caseId}`)).body.fraudCase.status).toBe('rejected');
  });

  it('несуществующий случай даёт 404', async () => {
    const monitor = await staff('monitoring');
    const res = await monitor.get('/staff/fraud/99999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('API: права на рабочее место', () => {
  const ENDPOINTS = [
    ['get', '/staff/kyc', 'kyc.review'],
    ['get', '/staff/kyc/1', 'kyc.review'],
    ['post', '/staff/kyc/1', 'kyc.review'],
    ['post', '/staff/cash', 'cash.operate'],
    ['get', '/staff/incoming', 'cash.operate'],
    ['post', '/staff/incoming', 'cash.operate'],
    ['get', '/staff/accounts?q=a', 'account.freeze'],
    ['post', '/staff/accounts/1/freeze', 'account.freeze'],
    ['get', '/staff/fraud', 'fraud.review'],
    ['get', '/staff/fraud/1', 'fraud.review'],
    ['post', '/staff/fraud/1', 'fraud.review']
  ];

  it('гость получает 401', async () => {
    const guest = apiClient(app);
    await guest.refresh();
    for (const [method, url] of ENDPOINTS) {
      const res = method === 'get' ? await guest.get(url) : await guest.post(url, {});
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it('клиент получает 403 на все методы', async () => {
    const { api } = await loggedClient();
    for (const [method, url] of ENDPOINTS) {
      const res = method === 'get' ? await api.get(url) : await api.post(url, {});
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }
  });

  it('сотрудник без нужного права получает 403, с правом пускается', async () => {
    const holders = {
      operator: { api: await staff('operator'), permissions: ['kyc.review', 'cash.operate', 'account.freeze'] },
      monitoring: { api: await staff('monitoring'), permissions: ['fraud.review'] },
      credit_officer: { api: await staff('credit_officer'), permissions: [] }
    };
    for (const [role, { api, permissions }] of Object.entries(holders)) {
      for (const [method, url, permission] of ENDPOINTS) {
        const res = method === 'get' ? await api.get(url) : await api.post(url, {});
        if (permissions.includes(permission)) expect(res.status, `${role} ${method} ${url}`).not.toBe(403);
        else expect(res.status, `${role} ${method} ${url}`).toBe(403);
      }
    }
  });
});
