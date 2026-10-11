import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/authService.js';
import { getStatement } from '../src/services/statementService.js';
import { createTransfer } from '../src/services/transferService.js';
import { addDays } from '../src/lib/dates.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

describe('выписка', () => {
  it('входящий остаток, операции и исходящий остаток согласованы с остатком счёта', async () => {
    const a = await createClientWithAccount(100000);
    const b = await createClientWithAccount(0);
    await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: 9000, comment: 'За обед' });
    const s = await getStatement(a.userId, a.accountId);
    expect(s.closing).toBe(91000);
    expect(s.closing).toBe((await getAccount(a.accountId)).balance);
    expect(s.credit).toBe(100000);
    expect(s.debit).toBe(-9000);
    expect(s.operations.at(-1)).toMatchObject({ amount: -9000, balance: 91000, description: 'За обед' });
    // период в будущем: операций нет, остаток переносится
    const later = await getStatement(a.userId, a.accountId, { from: addDays(s.today, 5), to: addDays(s.today, 9) });
    expect(later.opening).toBe(91000);
    expect(later.operations).toHaveLength(0);
    expect(later.closing).toBe(91000);
  });

  it('проверяет период и чужой счёт', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(1000);
    await expect(getStatement(a.userId, a.accountId, { from: '2026-12-01', to: '2026-01-01' })).rejects.toMatchObject({ fields: { from: expect.any(String) } });
    await expect(getStatement(a.userId, a.accountId, { from: 'вчера', to: '2026-01-01' })).rejects.toMatchObject({ fields: { from: expect.any(String) } });
    await expect(getStatement(b.userId, a.accountId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('PDF-документы', () => {
  it('выписка, справка и квитанция отдаются как PDF', async () => {
    const hash = await hashPassword('Parol2026');
    const c = await createClientWithAccount(100000, 'BYN', hash);
    const { pay } = await import('../src/services/paymentService.js');
    const providerId = (await pool.query("SELECT id FROM payment_providers WHERE name = 'Энергосбыт'")).rows[0].id;
    const payment = await pay(c.userId, { providerId, fromAccountId: c.accountId, amount: 1000, requisite: '12345678' });
    const app = createApp();
    const agent = request.agent(app);
    const page = await agent.get('/login');
    const token = /name="_csrf" value="([0-9a-f]+)"/.exec(page.text)[1];
    await agent.post('/login').type('form').send({ _csrf: token, login: c.login, password: 'Parol2026' });
    for (const url of [`/accounts/${c.accountId}/statement.pdf`, `/accounts/${c.accountId}/certificate.pdf`, `/payments/${payment.id}/receipt.pdf`]) {
      const res = await agent.get(url).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (d) => chunks.push(d)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
      expect(res.status, url).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.body.length).toBeGreaterThan(2000);
    }
    expect((await agent.get(`/accounts/${c.accountId}/statement`)).text).toContain('Исходящий остаток');
  });
});
