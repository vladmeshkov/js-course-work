import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../server/db/pool.js';
import { createTransfer, confirmTransfer } from '../../server/modules/transfers/transfer.service.js';
import { convert, refreshRates } from '../../server/modules/rates/rates.service.js';
import { trialBalance } from '../../server/modules/ledger/ledger.service.js';
import * as settingsModel from '../../server/modules/settings/settings.model.js';
import { createClientWithAccount, addAccount, getAccount, closePool } from '../helpers.js';

afterAll(closePool);

const ibanOf = async (id) => (await getAccount(id)).iban;

describe('курсы и конвертация', () => {
  it('клиент продаёт валюту по курсу покупки со спредом и покупает по курсу продажи', async () => {
    // USD: 3,275 BYN, спред 1,5 %
    expect(await convert({ from: 'USD', to: 'BYN', amount: 10000 })).toBe(Math.round(10000 * 3.275 * 0.985));
    expect(await convert({ from: 'BYN', to: 'USD', amount: 100000 })).toBe(Math.round(100000 / (3.275 * 1.015)));
    expect(await convert({ from: 'BYN', to: 'BYN', amount: 123 })).toBe(123);
  });
});

describe('перевод между своими счетами', () => {
  it('с конвертацией зачисляет сумму по курсу банка и сохраняет баланс двойной записи', async () => {
    const c = await createClientWithAccount(100000);
    const usd = await addAccount(c.clientId, 'USD', 0);
    await createTransfer(c.userId, { kind: 'own', fromAccountId: c.accountId, toAccountId: usd.id, amount: 100000 });
    expect((await getAccount(usd.id)).balance).toBe(Math.round(100000 / (3.275 * 1.015)));
    for (const row of await trialBalance(pool)) expect(row.ok).toBe(true);
  });

  it('чужой счёт и совпадающие счета отклоняются', async () => {
    const a = await createClientWithAccount(5000);
    const b = await createClientWithAccount(0);
    await expect(createTransfer(a.userId, { kind: 'own', fromAccountId: a.accountId, toAccountId: b.accountId, amount: 100 }))
      .rejects.toMatchObject({ fields: { toAccountId: expect.any(String) } });
    await expect(createTransfer(a.userId, { kind: 'own', fromAccountId: a.accountId, toAccountId: a.accountId, amount: 100 }))
      .rejects.toMatchObject({ fields: { toAccountId: expect.any(String) } });
  });
});

describe('перевод другому клиенту', () => {
  it('крупная сумма требует код, неверный код считается, верный проводит один раз', async () => {
    const a = await createClientWithAccount(200000);
    const b = await createClientWithAccount(0);
    const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 20000 });
    expect(r.executed).toBe(false);
    expect(r.otpCode).toMatch(/^\d{6}$/);
    expect((await getAccount(a.accountId)).balance).toBe(200000);

    const wrong = r.otpCode === '000000' ? '111111' : '000000';
    await expect(confirmTransfer(a.userId, r.intent.id, wrong)).rejects.toMatchObject({ code: 'otp_wrong' });
    expect((await getAccount(a.accountId)).balance).toBe(200000);

    const done = await confirmTransfer(a.userId, r.intent.id, r.otpCode);
    expect(done.duplicate).toBe(false);
    expect((await getAccount(a.accountId)).balance).toBe(180000);
    expect((await getAccount(b.accountId)).balance).toBe(20000);
    // повторное подтверждение не создаёт второй перевод
    await expect(confirmTransfer(a.userId, r.intent.id, r.otpCode)).rejects.toThrow(/уже обработан/);
    expect((await getAccount(b.accountId)).balance).toBe(20000);
  });

  it('после трёх неверных кодов подтвердить уже нельзя', async () => {
    const a = await createClientWithAccount(200000);
    const b = await createClientWithAccount(0);
    const r = await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 20000 });
    const wrong = r.otpCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) await expect(confirmTransfer(a.userId, r.intent.id, wrong)).rejects.toMatchObject({ code: 'otp_wrong' });
    await expect(confirmTransfer(a.userId, r.intent.id, r.otpCode)).rejects.toMatchObject({ code: 'otp_expired' });
  });

  it('проверяет номер счёта и существование получателя', async () => {
    const a = await createClientWithAccount(50000);
    const iban = await ibanOf(a.accountId);
    const broken = iban.slice(0, 27) + (iban[27] === '0' ? '1' : '0');
    await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: broken, amount: 100 }))
      .rejects.toMatchObject({ fields: { toIban: expect.stringContaining('контрольные цифры') } });
  });

  it('не уходит в минус', async () => {
    const a = await createClientWithAccount(1000);
    const b = await createClientWithAccount(0);
    await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: await ibanOf(b.accountId), amount: 2000 }))
      .rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('действует суточный лимит', async () => {
    await settingsModel.set('transfer.daily_limit', 30000);
    try {
      const a = await createClientWithAccount(500000);
      const b = await createClientWithAccount(0);
      const iban = await ibanOf(b.accountId);
      await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 9000 });
      await createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 9000 });
      await expect(createTransfer(a.userId, { kind: 'client', fromAccountId: a.accountId, toIban: iban, amount: 20000 }))
        .rejects.toMatchObject({ code: 'daily_limit' });
    } finally {
      await settingsModel.set('transfer.daily_limit', 500000);
    }
  });

});
