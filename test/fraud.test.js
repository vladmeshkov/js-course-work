import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { createTransfer, confirmTransfer, reviewHeldTransfer } from '../src/services/transferService.js';
import { evaluate, queue, specialControlReport } from '../src/services/fraudService.js';
import * as settingsModel from '../src/models/settingsModel.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const ibanOf = async (id) => (await getAccount(id)).iban;
const send = (a, b, amount) => async () => createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount });

describe('антифрод', () => {
  it('обычный небольшой перевод не вызывает подозрений', async () => {
    const a = await createClientWithAccount(500000);
    const b = await createClientWithAccount(0);
    const r = await evaluate({ userId: a.userId, clientId: a.clientId, toAccountId: b.accountId, amountByn: 5000 });
    expect(r.decision).toBe('allow');
    expect(r.score).toBe(0);
  });

  it('крупный перевод новому получателю задерживается, деньги резервируются', async () => {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await send(a, b, 400000)();
    expect(r.review).toBe(true);
    expect(r.executed).toBe(false);
    expect((await getAccount(a.accountId)).balance).toBe(2000000);
    expect((await getAccount(b.accountId)).balance).toBe(0);
    const { rows: [h] } = await pool.query("SELECT amount, status FROM holds WHERE intent_id = $1", [r.intent.id]);
    expect(h).toMatchObject({ amount: 400000, status: 'active' });
  });

  it('специалист одобряет: перевод проводится, холд снимается', async () => {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await send(a, b, 400000)();
    const fraudCase = (await queue()).find((c) => c.intent_id === r.intent.id);
    expect(fraudCase.score).toBeGreaterThanOrEqual(60);
    const officer = (await pool.query("SELECT id FROM users LIMIT 1")).rows[0];
    await expect(reviewHeldTransfer(officer.id, fraudCase.id, { approve: false, comment: '' })).rejects.toMatchObject({ fields: { comment: expect.any(String) } });
    await reviewHeldTransfer(officer.id, fraudCase.id, { approve: true });
    expect((await getAccount(a.accountId)).balance).toBe(1600000);
    expect((await getAccount(b.accountId)).balance).toBe(400000);
    await expect(reviewHeldTransfer(officer.id, fraudCase.id, { approve: true })).rejects.toThrow(/уже рассмотрен/);
    const { rows: [h] } = await pool.query("SELECT status FROM holds WHERE intent_id = $1", [r.intent.id]);
    expect(h.status).toBe('released');
  });

  it('специалист отклоняет: деньги разблокированы, перевода нет', async () => {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await send(a, b, 400000)();
    const fraudCase = (await queue()).find((c) => c.intent_id === r.intent.id);
    const officer = (await pool.query("SELECT id FROM users LIMIT 1")).rows[0];
    await reviewHeldTransfer(officer.id, fraudCase.id, { approve: false, comment: 'Подозрение на мошенничество' });
    expect((await getAccount(a.accountId)).balance).toBe(2000000);
    expect((await pool.query('SELECT status FROM transfer_intents WHERE id = $1', [r.intent.id])).rows[0].status).toBe('rejected');
    // деньги снова доступны
    const c = await createClientWithAccount(0);
    const ok = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(c.accountId), amount: 5000 });
    expect(ok.executed).toBe(true);
  });

  it('средний риск требует код даже для небольшой суммы', async () => {
    await settingsModel.set('fraud.velocity_count', 2);
    try {
      const a = await createClientWithAccount(500000);
      const b = await createClientWithAccount(0);
      const first = await send(a, b, 1000)();
      expect(first.executed).toBe(true);
      const second = await send(a, b, 1000)();
      expect(second.executed).toBe(false);
      expect(second.otpCode).toMatch(/^\d{6}$/);
      await confirmTransfer(a.userId, second.intent.id, second.otpCode);
      expect((await getAccount(b.accountId)).balance).toBe(2000);
    } finally {
      await settingsModel.set('fraud.velocity_count', 4);
    }
  });

  it('операции особого контроля попадают в отчёт', async () => {
    await settingsModel.set('fraud.special_control', 100000);
    await settingsModel.set('fraud.large_amount', 99999999);
    await settingsModel.set('fraud.new_recipient_amount', 99999999);
    await settingsModel.set('fraud.new_client_amount', 99999999);
    await settingsModel.set('transfer.daily_limit', 99999999);
    try {
      const a = await createClientWithAccount(500000);
      const b = await createClientWithAccount(0);
      await send(a, b, 150000)().then(async (r) => { if (!r.executed) await confirmTransfer(a.userId, r.intent.id, r.otpCode); });
      const report = await specialControlReport();
      expect(report.some((x) => x.amount_byn === 150000)).toBe(true);
    } finally {
      await settingsModel.set('fraud.special_control', 2000000);
      await settingsModel.set('fraud.large_amount', 300000);
      await settingsModel.set('fraud.new_recipient_amount', 100000);
      await settingsModel.set('fraud.new_client_amount', 50000);
      await settingsModel.set('transfer.daily_limit', 500000);
    }
  });
});
