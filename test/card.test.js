import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { decrypt } from '../src/lib/crypto.js';
import { isValidCardNumber } from '../src/lib/luhn.js';
import { generateCardNumber, issueCard, setBlocked, updateLimits, purchase, closeCard, reissue, getForClient } from '../src/services/cardService.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const issue = (c, extra = {}) => issueCard(c.userId, { accountId: c.accountId, system: 'belkart', pin: '1234', ...extra });

describe('карты', () => {
  it('номера проходят проверку Луна для всех систем', () => {
    for (const s of ['belkart', 'visa', 'mastercard']) expect(isValidCardNumber(generateCardNumber(s))).toBe(true);
  });

  it('выпуск: номер зашифрован, CVV и PIN хранятся только хэшем', async () => {
    const c = await createClientWithAccount(100000);
    const card = await issue(c);
    expect(isValidCardNumber(card.number)).toBe(true);
    const { rows: [row] } = await pool.query('SELECT * FROM cards WHERE id = $1', [card.id]);
    expect(row.number_enc).not.toContain(card.number);
    expect(decrypt(row.number_enc)).toBe(card.number);
    expect(row.cvv_hash).not.toContain(card.cvv);
    expect(row.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(row.last4).toBe(card.number.slice(-4));
  });

  it('проверяет PIN, систему и счёт; чужой счёт не подходит', async () => {
    const a = await createClientWithAccount(0);
    const b = await createClientWithAccount(0);
    await expect(issue(a, { pin: '12' })).rejects.toMatchObject({ fields: { pin: expect.any(String) } });
    await expect(issue(a, { system: 'mir' })).rejects.toMatchObject({ fields: { system: expect.any(String) } });
    await expect(issue(a, { accountId: b.accountId })).rejects.toMatchObject({ fields: { accountId: expect.any(String) } });
  });

  it('покупка списывает деньги со счёта; блокировка запрещает операции', async () => {
    const c = await createClientWithAccount(100000);
    const card = await issue(c);
    await purchase(c.userId, card.id, { amount: 2500, online: false, place: 'Евроопт' });
    expect((await getAccount(c.accountId)).balance).toBe(97500);
    await setBlocked(c.userId, card.id, true);
    await expect(purchase(c.userId, card.id, { amount: 100, online: false })).rejects.toMatchObject({ code: 'card_blocked' });
    await setBlocked(c.userId, card.id, false);
    await purchase(c.userId, card.id, { amount: 100, online: false });
  });

  it('действуют лимиты на операцию, сутки, месяц и запрет интернет-платежей', async () => {
    const c = await createClientWithAccount(1000000);
    const card = await issue(c);
    await updateLimits(c.userId, card.id, { perOp: 20000, daily: 30000, monthly: 50000, online: false });
    await expect(purchase(c.userId, card.id, { amount: 20001, online: false })).rejects.toMatchObject({ code: 'per_op_limit' });
    await expect(purchase(c.userId, card.id, { amount: 100, online: true })).rejects.toMatchObject({ code: 'online_disabled' });
    await purchase(c.userId, card.id, { amount: 20000, online: false });
    await expect(purchase(c.userId, card.id, { amount: 10001, online: false })).rejects.toMatchObject({ code: 'daily_limit' });
    await purchase(c.userId, card.id, { amount: 10000, online: false });
    expect((await getAccount(c.accountId)).balance).toBe(1000000 - 30000);
  });

  it('не даёт задать противоречивые лимиты', async () => {
    const c = await createClientWithAccount(0);
    const card = await issue(c);
    await expect(updateLimits(c.userId, card.id, { perOp: 50000, daily: 10000, monthly: 90000, online: true })).rejects.toMatchObject({ fields: { perOp: expect.any(String) } });
    await expect(updateLimits(c.userId, card.id, { perOp: 100, daily: 90000, monthly: 10000, online: true })).rejects.toMatchObject({ fields: { daily: expect.any(String) } });
  });

  it('недостаток средств отклоняет покупку, чужую карту трогать нельзя', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(1000);
    const card = await issue(a);
    await expect(purchase(a.userId, card.id, { amount: 2000, online: false })).rejects.toMatchObject({ code: 'insufficient_funds' });
    await expect(setBlocked(b.userId, card.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(getForClient(b.userId, card.id)).rejects.toMatchObject({ status: 404 });
  });

  it('перевыпуск закрывает старую карту и создаёт новую', async () => {
    const c = await createClientWithAccount(0);
    const old = await issue(c);
    const fresh = await reissue(c.userId, old.id, '4321');
    expect(fresh.number).not.toBe(old.number);
    const { rows } = await pool.query('SELECT id, status FROM cards WHERE client_id = $1 ORDER BY id', [c.clientId]);
    expect(rows.map((r) => r.status)).toEqual(['closed', 'active']);
    await expect(purchase(c.userId, old.id, { amount: 100, online: false })).rejects.toThrow(/закрыта/);
    await closeCard(c.userId, fresh.id);
  });
});
