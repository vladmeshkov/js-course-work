import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import { post, reverse, balanceFromPostings, trialBalance } from '../src/services/ledgerService.js';
import { createClientWithAccount, accountBalance, closePool } from './helpers.js';

afterAll(closePool);

const entry = (debit, credit, amount) => ({ debit, credit, amount, currency: 'BYN' });

describe('ledgerService', () => {
  it('переводит деньги и держит остаток равным оборотам по проводкам', async () => {
    const a = await createClientWithAccount(10000);
    const b = await createClientWithAccount(0);
    await post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 2500)] });
    expect(await accountBalance(a.accountId)).toBe(7500);
    expect(await accountBalance(b.accountId)).toBe(2500);
    expect(await balanceFromPostings(pool, a.accountId)).toBe(7500);
    expect(await balanceFromPostings(pool, b.accountId)).toBe(2500);
  });

  it('не даёт уйти в минус и не оставляет следов', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(0);
    await expect(post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 1001)] }))
      .rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(await accountBalance(a.accountId)).toBe(1000);
    const { rows } = await pool.query('SELECT count(*) AS n FROM postings WHERE debit_account_id = ?', [a.accountId]);
    expect(rows[0].n).toBe(0);
  });

  it('повторный запрос с тем же ключом не создаёт второй перевод', async () => {
    const a = await createClientWithAccount(5000);
    const b = await createClientWithAccount(0);
    const request = { type: 'transfer', idempotencyKey: `key-${a.accountId}`, entries: [entry(a.accountId, b.accountId, 1000)] };
    const first = await post(request);
    const second = await post(request);
    expect(second.duplicate).toBe(true);
    expect(second.documentId).toBe(first.documentId);
    expect(await accountBalance(a.accountId)).toBe(4000);
  });

  it('учитывает активные холды при проверке остатка', async () => {
    const a = await createClientWithAccount(5000);
    const b = await createClientWithAccount(0);
    await pool.query("INSERT INTO holds (account_id, amount) VALUES (?, 4500)", [a.accountId]);
    await expect(post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 600)] })).rejects.toMatchObject({ code: 'insufficient_funds' });
    await post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 500)] });
  });

  it('запрещает списание с заблокированного счёта, но принимает поступления', async () => {
    const a = await createClientWithAccount(5000);
    const b = await createClientWithAccount(1000);
    await pool.query("UPDATE accounts SET status = 'frozen' WHERE id = ?", [a.accountId]);
    await expect(post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 100)] })).rejects.toThrow(/заблокирован/);
    await post({ type: 'transfer', entries: [entry(b.accountId, a.accountId, 100)] });
    expect(await accountBalance(a.accountId)).toBe(5100);
  });

  it('сторно возвращает остатки, исходные проводки остаются', async () => {
    const a = await createClientWithAccount(8000);
    const b = await createClientWithAccount(0);
    const { documentId } = await post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 3000)] });
    await reverse(documentId, { reason: 'ошибочный перевод' });
    expect(await accountBalance(a.accountId)).toBe(8000);
    expect(await accountBalance(b.accountId)).toBe(0);
    const { rows } = await pool.query('SELECT count(*) AS n FROM postings WHERE document_id = ?', [documentId]);
    expect(rows[0].n).toBe(1);
    await expect(reverse(documentId)).rejects.toThrow(/уже сторнирован/);
  });

  it('проводки нельзя изменять и удалять', async () => {
    const a = await createClientWithAccount(1000);
    await expect(pool.query('UPDATE postings SET amount = 1 WHERE debit_account_id = ? OR credit_account_id = ?', [a.accountId, a.accountId]))
      .rejects.toThrow(/только добавление/);
    await expect(pool.query('DELETE FROM postings WHERE credit_account_id = ?', [a.accountId, a.accountId])).rejects.toThrow(/только добавление/);
  });

  it('при ошибке в середине документа откатывает все проводки', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(0);
    await expect(withTransaction((db) => post({
      type: 'multi',
      entries: [entry(a.accountId, b.accountId, 500), entry(a.accountId, b.accountId, 900)]
    }, db))).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(await accountBalance(a.accountId)).toBe(1000);
  });

  it('параллельные переводы не уводят счёт в минус', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(0);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => post({ type: 'transfer', entries: [entry(a.accountId, b.accountId, 300)] }))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await accountBalance(a.accountId)).toBe(100);
    expect(await accountBalance(b.accountId)).toBe(900);
  });

  it('сумма остатков всех счетов в каждой валюте равна нулю', async () => {
    const rows = await trialBalance(pool);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.ok).toBe(true);
  });
});
