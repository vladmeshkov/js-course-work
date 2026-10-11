import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import { buildIban } from '../src/lib/iban.js';
import { lookupHash } from '../src/lib/crypto.js';
import { createTransfer, confirm, cancel, processClearing, registerIncoming, bankCodeOf, listForUser, clearingOverview } from '../src/services/interbankService.js';
import { closeDay } from '../src/services/eodService.js';
import { trialBalance } from '../src/services/ledgerService.js';
import * as userModel from '../src/models/userModel.js';
import { queue as fraudQueue, review as fraudReview } from '../src/services/fraudService.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const extIban = (code, n = 1) => buildIban(code, '2400', n);
const today = async () => String((await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date).slice(0, 10);
const clear = async () => withTransaction(async (db) => processClearing(db, await today()));

async function queued(c, { code = 'DRZH', amount = 20000 } = {}) {
  const r = await createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban(code, c.accountId), name: 'Иван Петров', amount, purpose: 'Аренда' });
  return confirm(c.userId, r.transfer.id, r.otpCode);
}

describe('межбанковские переводы', () => {
  it('определяет банк по коду в IBAN', () => {
    expect(bankCodeOf(extIban('MRKT'))).toBe('MRKT');
  });

  it('оформление: комиссия не меньше минимальной, нужен код, до подтверждения деньги не резервируются', async () => {
    const c = await createClientWithAccount(100000);
    const r = await createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban('DRZH'), name: 'Иван Петров', amount: 1000 });
    expect(r.transfer.fee).toBe(50);
    expect(r.otpCode).toMatch(/^\d{6}$/);
    expect(r.transfer.status).toBe('pending_otp');
    const big = await createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban('DRZH'), name: 'Иван Петров', amount: 40000 });
    expect(big.transfer.fee).toBe(200);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM holds WHERE account_id = $1", [c.accountId]);
    expect(rows[0].n).toBe(0);
    const wrong = r.otpCode === '000000' ? '111111' : '000000';
    await expect(confirm(c.userId, r.transfer.id, wrong)).rejects.toMatchObject({ code: 'otp_wrong' });
  });

  it('проверяет номер, банк, имя, сумму и остаток', async () => {
    const c = await createClientWithAccount(5000);
    const base = { fromAccountId: c.accountId, iban: extIban('DRZH'), name: 'Иван Петров', amount: 1000 };
    await expect(createTransfer(c.userId, { ...base, iban: 'BY00' })).rejects.toMatchObject({ fields: { iban: expect.any(String) } });
    await expect(createTransfer(c.userId, { ...base, iban: extIban('XXXX') })).rejects.toMatchObject({ fields: { iban: expect.stringContaining('не найден') } });
    await expect(createTransfer(c.userId, { ...base, name: 'И' })).rejects.toMatchObject({ fields: { name: expect.any(String) } });
    await expect(createTransfer(c.userId, { ...base, amount: 99999999 })).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
    await expect(createTransfer(c.userId, { ...base, amount: 5000 })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('после подтверждения деньги зарезервированы, клиринг списывает их и отправляет пакет', async () => {
    const c = await createClientWithAccount(100000);
    const t = await queued(c);
    expect(t.status).toBe('queued');
    expect((await getAccount(c.accountId)).balance).toBe(100000);
    const stats = await clear();
    expect(stats.sent).toBeGreaterThanOrEqual(1);
    // списано 200 BYN и комиссия 1 BYN (0,5 % от 200 = 100 копеек)
    expect((await getAccount(c.accountId)).balance).toBe(100000 - 20000 - 100);
    const [row] = await listForUser(c.userId);
    expect(row.status).toBe('sent');
    expect(row.batch_id).not.toBeNull();
    const { rows: [h] } = await pool.query('SELECT status FROM holds WHERE id = $1', [row.hold_id]);
    expect(h.status).toBe('released');
    for (const r of await trialBalance(pool)) expect(r.ok).toBe(true);
    // повторный клиринг ничего не отправляет
    expect((await clear()).sent).toBe(0);
  });

  it('банк, не принимающий платежи, возвращает деньги: перевод отклоняется, холд снят', async () => {
    const c = await createClientWithAccount(100000);
    const t = await queued(c, { code: 'ZKRT' });
    await clear();
    const [row] = await listForUser(c.userId);
    expect(row.id).toBe(t.id);
    expect(row.status).toBe('rejected');
    expect((await getAccount(c.accountId)).balance).toBe(100000);
    const { rows: [h] } = await pool.query('SELECT status FROM holds WHERE id = $1', [row.hold_id]);
    expect(h.status).toBe('released');
  });

  it('отмена в очереди снимает резерв; отправленный платёж отменить нельзя', async () => {
    const c = await createClientWithAccount(100000);
    const t = await queued(c);
    await cancel(c.userId, t.id);
    expect((await clear()).sent).toBe(0);
    const t2 = await queued(c);
    await clear();
    await expect(cancel(c.userId, t2.id)).rejects.toThrow(/нельзя отменить/);
    const other = await createClientWithAccount(0);
    await expect(cancel(other.userId, t2.id)).rejects.toMatchObject({ status: 404 });
  });

  it('резерв не даёт потратить те же деньги дважды', async () => {
    const c = await createClientWithAccount(30000);
    await queued(c, { amount: 20000 });
    await expect(createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban('DRZH'), name: 'Иван Петров', amount: 20000 })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('входящий платёж из другого банка зачисляется клиенту', async () => {
    const op = await userModel.create(pool, { login: `ibop${Date.now()}`, passwordHash: 'x', roleCode: 'operator' });
    const c = await createClientWithAccount(0);
    const iban = (await getAccount(c.accountId)).iban;
    await registerIncoming(op, { iban, bankCode: 'MRKT', name: 'ООО Ромашка', amount: 75000, purpose: 'Оплата' });
    expect((await getAccount(c.accountId)).balance).toBe(75000);
    await expect(registerIncoming(op, { iban: 'BY00', bankCode: 'MRKT', name: 'ООО', amount: 100 })).rejects.toMatchObject({ fields: { iban: expect.any(String) } });
    for (const r of await trialBalance(pool)) expect(r.ok).toBe(true);
  });

  it('закрытие дня запускает клиринг, обзор показывает пакеты', async () => {
    const c = await createClientWithAccount(100000);
    await queued(c);
    const r = await closeDay(null);
    expect(r.clearing.sent).toBeGreaterThanOrEqual(1);
    const o = await clearingOverview();
    expect(o.batches.length).toBeGreaterThan(0);
    expect(o.banks.map((b) => b.code)).toEqual(expect.arrayContaining(['DRZH', 'MRKT', 'ZKRT']));
    expect(lookupHash('x')).toBeTruthy();
  });
});

describe('антифрод для переводов в другие банки', () => {
  const officer = async () => (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;
  const heldTransfer = async () => {
    const c = await createClientWithAccount(2000000);
    // крупная сумма новому получателю новым клиентом: 40 + 30 + 20 баллов, это выше порога задержки
    const r = await createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban('DRZH', c.accountId), name: 'Иван Петров', amount: 400000, purpose: 'Покупка' });
    expect(r.transfer.risk_decision).toBe('review');
    const t = await confirm(c.userId, r.transfer.id, r.otpCode);
    return { c, t };
  };

  it('мелкий перевод проходит без задержки', async () => {
    const c = await createClientWithAccount(100000);
    const r = await createTransfer(c.userId, { fromAccountId: c.accountId, iban: extIban('DRZH', c.accountId), name: 'Иван Петров', amount: 2000 });
    expect(r.transfer.risk_decision).toBe('allow');
    expect((await confirm(c.userId, r.transfer.id, r.otpCode)).status).toBe('queued');
  });

  it('подозрительный перевод задерживается: деньги зарезервированы, случай в очереди, клиринг его не отправляет', async () => {
    const { c, t } = await heldTransfer();
    expect(t.status).toBe('review');
    const { rows: [h] } = await pool.query("SELECT amount, status FROM holds WHERE id = $1", [t.hold_id]);
    expect(h).toMatchObject({ amount: 400000 + t.fee, status: 'active' });
    const fraudCase = (await fraudQueue()).find((x) => x.interbank_id === t.id);
    expect(fraudCase).toMatchObject({ interbank: true, status: 'open' });
    expect(fraudCase.score).toBeGreaterThanOrEqual(60);
    await clear();
    expect((await getAccount(c.accountId)).balance).toBe(2000000);
    expect((await pool.query('SELECT status FROM interbank_transfers WHERE id = $1', [t.id])).rows[0].status).toBe('review');
  });

  it('специалист одобряет: платёж встаёт в очередь клиринга и уходит при закрытии дня', async () => {
    const { c, t } = await heldTransfer();
    const fraudCase = (await fraudQueue()).find((x) => x.interbank_id === t.id);
    await fraudReview(await officer(), fraudCase.id, { approve: true }, async () => { throw new Error('не должно вызываться'); });
    expect((await pool.query('SELECT status FROM interbank_transfers WHERE id = $1', [t.id])).rows[0].status).toBe('queued');
    await clear();
    expect((await getAccount(c.accountId)).balance).toBeLessThan(2000000 - 400000);
  });

  it('специалист отклоняет: резерв снимается, причина записывается', async () => {
    const { c, t } = await heldTransfer();
    const fraudCase = (await fraudQueue()).find((x) => x.interbank_id === t.id);
    await expect(fraudReview(await officer(), fraudCase.id, { approve: false, comment: '' }, null)).rejects.toMatchObject({ fields: { comment: expect.any(String) } });
    await fraudReview(await officer(), fraudCase.id, { approve: false, comment: 'Подозрение на мошенничество' }, null);
    const { rows: [row] } = await pool.query('SELECT status, reject_reason FROM interbank_transfers WHERE id = $1', [t.id]);
    expect(row).toMatchObject({ status: 'rejected', reject_reason: 'Подозрение на мошенничество' });
    expect((await pool.query('SELECT status FROM holds WHERE id = $1', [t.hold_id])).rows[0].status).toBe('released');
    expect((await getAccount(c.accountId)).balance).toBe(2000000);
  });
});

