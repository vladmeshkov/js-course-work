import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../server/db/pool.js';
import { buildIban } from '../../server/shared/iban.js';
import { createTransfer, confirmTransfer, cancelTransfer, reviewHeldTransfer } from '../../server/modules/transfers/transfer.service.js';
import * as interbank from '../../server/modules/transfers/interbank.service.js';
import { queue as fraudQueue } from '../../server/modules/fraud/fraud.service.js';
import { setFrozen } from '../../server/modules/accounts/account.service.js';
import { closeDay } from '../../server/modules/admin/eod.service.js';
import { trialBalance } from '../../server/modules/ledger/ledger.service.js';
import * as otpService from '../../server/modules/auth/otp.service.js';
import * as settingsModel from '../../server/modules/settings/settings.model.js';
import { createClientWithAccount, getAccount, closePool } from '../helpers.js';

afterAll(closePool);

const ibanOf = async (id) => (await getAccount(id)).iban;
const officer = async () => (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;

/** Временно меняет настройку на время теста. */
async function withSetting(key, value, work) {
  const before = await settingsModel.getNumber(key);
  await settingsModel.set(key, value);
  try {
    await work();
  } finally {
    await settingsModel.set(key, before);
  }
}

describe('суточный лимит под блокировкой', () => {
  it('две заявки, созданные до подтверждения, не превышают лимит вместе', async () => {
    await withSetting('transfer.daily_limit', 100000, async () => {
      await withSetting('transfer.otp_threshold', 1, async () => {
        const a = await createClientWithAccount(500000);
        const b = await createClientWithAccount(0);
        const iban = await ibanOf(b.accountId);
        // обе заявки по 800 BYN проходят предварительную проверку: подтверждённых переводов ещё нет
        const first = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 80000 });
        const second = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 80000 });
        await confirmTransfer(a.userId, first.intent.id, first.otpCode);
        await expect(confirmTransfer(a.userId, second.intent.id, second.otpCode)).rejects.toMatchObject({ code: 'daily_limit' });
        expect((await getAccount(b.accountId)).balance).toBe(80000);
      });
    });
  });

  it('переводы в другие банки входят в тот же лимит', async () => {
    await withSetting('transfer.daily_limit', 100000, async () => {
      const a = await createClientWithAccount(500000);
      const r = await interbank.createTransfer(a.userId, { fromAccountId: a.accountId, iban: buildIban('DRZH', '2400', a.accountId), name: 'Иван Петров', amount: 70000 });
      await interbank.confirm(a.userId, r.transfer.id, r.otpCode);
      const b = await createClientWithAccount(0);
      await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 40000 }))
        .rejects.toMatchObject({ code: 'daily_limit' });
    });
  });
});

describe('статусы не перезаписывают друг друга', () => {
  it('отмена после проведения не меняет статус «проведён»', async () => {
    await withSetting('transfer.otp_threshold', 1, async () => {
      const a = await createClientWithAccount(500000);
      const b = await createClientWithAccount(0);
      const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 1000 });
      await confirmTransfer(a.userId, r.intent.id, r.otpCode);
      await cancelTransfer(a.userId, r.intent.id);
      const { rows: [intent] } = await pool.query('SELECT status FROM transfer_intents WHERE id = ?', [r.intent.id]);
      expect(intent.status).toBe('confirmed');
    });
  });

  it('параллельные «одобрить» и «отклонить» по одному случаю: срабатывает только одно решение', async () => {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 400000 });
    const fraudCase = (await fraudQueue()).find((c) => c.intent_id === r.intent.id);
    const id = await officer();
    const results = await Promise.allSettled([
      reviewHeldTransfer(id, fraudCase.id, { approve: true }),
      reviewHeldTransfer(id, fraudCase.id, { approve: false, comment: 'Сомнительная операция' })
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const { rows: [intent] } = await pool.query('SELECT status FROM transfer_intents WHERE id = ?', [r.intent.id]);
    const { rows: [c] } = await pool.query('SELECT status FROM fraud_cases WHERE id = ?', [fraudCase.id]);
    const received = (await getAccount(b.accountId)).balance;
    if (c.status === 'approved') {
      expect(intent.status).toBe('confirmed');
      expect(received).toBe(400000);
    } else {
      expect(intent.status).toBe('rejected');
      expect(received).toBe(0);
    }
  });
});

describe('задержанный перевод', () => {
  it('без денег на счёте не ставит холд и не создаёт случай', async () => {
    const a = await createClientWithAccount(10000);
    const b = await createClientWithAccount(0);
    await withSetting('transfer.daily_limit', 100000000, async () => {
      await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 900000 }))
        .rejects.toMatchObject({ code: 'insufficient_funds' });
    });
    const { rows } = await pool.query("SELECT 1 FROM holds WHERE account_id = ? AND status = 'active'", [a.accountId]);
    expect(rows).toHaveLength(0);
  });

  it('одобрение при нехватке денег ничего не меняет: холд и случай остаются', async () => {
    const a = await createClientWithAccount(2000000);
    const b = await createClientWithAccount(0);
    const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 400000 });
    const fraudCase = (await fraudQueue()).find((c) => c.intent_id === r.intent.id);
    // деньги ушли со счёта мимо холда (например, сторно), теперь их не хватает
    await pool.query('UPDATE accounts SET min_balance = 1900000 WHERE id = ?', [a.accountId]);
    try {
      await expect(reviewHeldTransfer(await officer(), fraudCase.id, { approve: true })).rejects.toMatchObject({ code: 'insufficient_funds' });
      const { rows: [hold] } = await pool.query('SELECT status FROM holds WHERE intent_id = ?', [r.intent.id]);
      const { rows: [c] } = await pool.query('SELECT status FROM fraud_cases WHERE id = ?', [fraudCase.id]);
      expect(hold.status).toBe('active');
      expect(c.status).toBe('open');
    } finally {
      await pool.query('UPDATE accounts SET min_balance = 0 WHERE id = ?', [a.accountId]);
    }
  });
});

describe('коды подтверждения', () => {
  it('параллельные неверные попытки не дают больше трёх проверок', async () => {
    const a = await createClientWithAccount(0);
    const purpose = `test:${Date.now()}`;
    const code = await otpService.issue(a.userId, purpose);
    const wrong = code === '000000' ? '111111' : '000000';
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => otpService.verify(a.userId, purpose, wrong)));
    const counted = results.filter((x) => x.reason?.code === 'otp_wrong');
    expect(counted).toHaveLength(3);
    // после исчерпания попыток верный код уже не принимается
    await expect(otpService.verify(a.userId, purpose, code)).rejects.toMatchObject({ code: 'otp_expired' });
  });
});

describe('закрытие дня', () => {
  it('платёж в другой банк с заблокированного счёта отклоняется, день закрывается', async () => {
    const a = await createClientWithAccount(100000);
    const r = await interbank.createTransfer(a.userId, { fromAccountId: a.accountId, iban: buildIban('DRZH', '2400', a.accountId), name: 'Иван Петров', amount: 20000 });
    await interbank.confirm(a.userId, r.transfer.id, r.otpCode);
    await setFrozen(await officer(), a.accountId, true, 'Решение суда');
    const before = String((await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date);
    const day = await closeDay(null);
    expect(day.date > before).toBe(true);
    const { rows: [t] } = await pool.query('SELECT status, reject_reason FROM interbank_transfers WHERE id = ?', [r.transfer.id]);
    expect(t.status).toBe('rejected');
    expect(t.reject_reason).toMatch(/заблокирован/);
    expect((await getAccount(a.accountId)).balance).toBe(100000);
    const { rows } = await pool.query("SELECT 1 FROM holds WHERE account_id = ? AND status = 'active'", [a.accountId]);
    expect(rows).toHaveLength(0);
    for (const row of await trialBalance(pool)) expect(row.ok).toBe(true);
  });

  it('с заблокированного счёта нельзя подтвердить перевод в другой банк', async () => {
    const a = await createClientWithAccount(100000);
    const r = await interbank.createTransfer(a.userId, { fromAccountId: a.accountId, iban: buildIban('DRZH', '2400', a.accountId), name: 'Иван Петров', amount: 20000 });
    await setFrozen(await officer(), a.accountId, true, 'Решение суда');
    await expect(interbank.confirm(a.userId, r.transfer.id, r.otpCode)).rejects.toThrow(/заблокирован/);
  });
});
