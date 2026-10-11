import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { trialBalance, trialBalanceCsv, portfolio } from '../src/services/reportService.js';
import { createTransfer } from '../src/services/transferService.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

describe('оборотно-сальдовая ведомость', () => {
  it('сходится: обороты по Дт равны оборотам по Кт во всех валютах', async () => {
    const a = await createClientWithAccount(100000);
    const b = await createClientWithAccount(0);
    await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: (await getAccount(b.accountId)).iban, amount: 5000 });
    for (const currency of ['BYN', 'USD', 'EUR', 'RUB']) {
      const r = await trialBalance({ from: '2000-01-01', to: '2999-12-31', currency });
      expect(r.balanced, currency).toBe(true);
      expect(r.total.debit).toBe(r.total.credit);
    }
    const byn = await trialBalance({ from: '2000-01-01', to: '2999-12-31' });
    expect(byn.lines.find((l) => l.code === '2400').closing).toBeGreaterThan(0);
    expect(byn.lines.find((l) => l.code === '1010').closing).toBeLessThan(0);
  });

  it('входящий остаток периода равен исходящему предыдущего', async () => {
    const all = await trialBalance({ from: '2000-01-01', to: '2999-12-31' });
    const first = await trialBalance({ from: '2000-01-01', to: '2025-12-31' });
    const next = await trialBalance({ from: '2026-01-01', to: '2999-12-31' });
    for (const l of next.lines) {
      const prev = first.lines.find((x) => x.code === l.code);
      expect(l.opening).toBe(prev ? prev.closing : 0);
      expect(l.closing).toBe(all.lines.find((x) => x.code === l.code).closing);
    }
  });

  it('проверяет период и формирует CSV для Excel', async () => {
    await expect(trialBalance({ from: '2026-12-01', to: '2026-01-01' })).rejects.toMatchObject({ fields: { from: expect.any(String) } });
    const csv = trialBalanceCsv(await trialBalance({ from: '2000-01-01', to: '2999-12-31' }));
    expect(csv.startsWith('﻿"Счёт";"Название"')).toBe(true);
    expect(csv).toContain('"Итого"');
  });

  it('показатели портфеля считаются', async () => {
    const p = await portfolio();
    expect(p.loans.buckets).toHaveLength(4);
    expect(p.operations.byType.length).toBeGreaterThan(0);
    expect(p.loans.overdueShare).toBeGreaterThanOrEqual(0);
  });
});
