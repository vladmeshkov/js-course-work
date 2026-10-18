import { describe, it, expect, afterAll } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import { addDays } from '../src/lib/dates.js';
import { pay, overview, getReceipt, createAutopayment, processAutopayments, catalog, removeTemplate } from '../src/services/paymentService.js';
import { trialBalance } from '../src/services/ledgerService.js';
import { createClientWithAccount, getAccount, closePool } from './helpers.js';

afterAll(closePool);

const providerId = async (name) => (await pool.query('SELECT id FROM payment_providers WHERE name = ?', [name])).rows[0].id;
const today = async () => String((await pool.query('SELECT bank_date FROM bank_state')).rows[0].bank_date).slice(0, 10);
const runAuto = (date) => withTransaction((db) => processAutopayments(db, date));

describe('каталог', () => {
  it('фильтрует поставщиков по городу и поиску, «все города» видны всегда', async () => {
    const water = await catalog.providers({ q: 'вод' });
    expect(water.map((p) => p.name)).toContain('Горводоканал');
    const brest = await catalog.providers({ categoryId: 1, city: 'Брест' });
    expect(brest.map((p) => p.name)).toEqual(expect.arrayContaining(['Горгаз', 'Энергосбыт']));
    expect(brest.map((p) => p.name)).not.toContain('Горводоканал');
    expect((await catalog.cities())).toContain('Минск');
  });
});

describe('оплата услуг', () => {
  it('списывает деньги и зачисляет их на счёт поставщика, выдаёт квитанцию', async () => {
    const c = await createClientWithAccount(50000);
    const pid = await providerId('Энергосбыт');
    const p = await pay(c.userId, { providerId: pid, fromAccountId: c.accountId, amount: 12550, requisite: '12345678' });
    expect((await getAccount(c.accountId)).balance).toBe(50000 - 12550);
    const { rows: [prov] } = await pool.query("SELECT balance FROM accounts WHERE purpose = ?", [`provider_${pid}`]);
    expect(prov.balance).toBeGreaterThanOrEqual(12550);
    const r = await getReceipt(c.userId, p.id);
    expect(r.provider_name).toBe('Энергосбыт');
    const other = await createClientWithAccount(0);
    await expect(getReceipt(other.userId, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it('проверяет маску реквизита, границы суммы и счёт', async () => {
    const c = await createClientWithAccount(50000);
    const pid = await providerId('Мобильный оператор «Синий»');
    await expect(pay(c.userId, { providerId: pid, fromAccountId: c.accountId, amount: 1000, requisite: '29123' })).rejects.toMatchObject({ fields: { requisite: expect.stringContaining('Номер телефона') } });
    await expect(pay(c.userId, { providerId: pid, fromAccountId: c.accountId, amount: 5, requisite: '+375291234567' })).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
    await expect(pay(c.userId, { providerId: pid, fromAccountId: 999999, amount: 1000, requisite: '+375291234567' })).rejects.toMatchObject({ fields: { fromAccountId: expect.any(String) } });
    expect((await getAccount(c.accountId)).balance).toBe(50000);
  });

  it('недостаток средств отклоняет платёж', async () => {
    const c = await createClientWithAccount(500);
    await expect(pay(c.userId, { providerId: await providerId('Энергосбыт'), fromAccountId: c.accountId, amount: 1000, requisite: '12345678' })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('удерживает комиссию поставщика', async () => {
    const c = await createClientWithAccount(50000);
    await pay(c.userId, { providerId: await providerId('Цифровое телевидение'), fromAccountId: c.accountId, amount: 10000, requisite: '1234567' });
    expect((await getAccount(c.accountId)).balance).toBe(50000 - 10000 - 50);
  });
});

describe('шаблоны и автоплатежи', () => {
  it('сохраняет шаблон при оплате и удаляет его', async () => {
    const c = await createClientWithAccount(50000);
    await pay(c.userId, { providerId: await providerId('Энергосбыт'), fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Квартира', saveAmount: true });
    const o = await overview(c.userId);
    expect(o.templates).toHaveLength(1);
    expect(o.templates[0].amount).toBe(1000);
    await removeTemplate(c.userId, o.templates[0].id);
    expect((await overview(c.userId)).templates).toHaveLength(0);
  });

  it('автоплатёж выполняется в свой день и переносится на следующий месяц', async () => {
    const c = await createClientWithAccount(50000);
    await pay(c.userId, { providerId: await providerId('Энергосбыт'), fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Свет' });
    const t = (await overview(c.userId)).templates[0];
    const auto = await createAutopayment(c.userId, { templateId: t.id, amount: 2000, day: 5 });
    const due = String(auto.next_date).slice(0, 10);
    expect(due > await today()).toBe(true);
    await runAuto(addDays(due, -1));
    expect((await getAccount(c.accountId)).balance).toBe(49000);
    await runAuto(due);
    expect((await getAccount(c.accountId)).balance).toBe(47000);
    const next = (await overview(c.userId)).autopayments[0];
    expect(String(next.next_date).slice(0, 10) > due).toBe(true);
    expect(next.last_result).toBe('Выполнен');
  });

  it('при нехватке денег повторяет на следующий день, после трёх неудач отключается', async () => {
    const c = await createClientWithAccount(2000);
    await pay(c.userId, { providerId: await providerId('Энергосбыт'), fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Свет' });
    const t = (await overview(c.userId)).templates[0];
    const auto = await createAutopayment(c.userId, { templateId: t.id, amount: 500000 / 100 * 10, day: 1 });
    let date = String(auto.next_date).slice(0, 10);
    for (let i = 0; i < 3; i++) {
      await runAuto(date);
      date = addDays(date, 1);
    }
    const { rows: [a] } = await pool.query('SELECT active, fail_count, last_result FROM autopayments WHERE id = ?', [auto.id]);
    expect(a.fail_count).toBe(3);
    expect(a.active).toBe(false);
    expect(a.last_result).toContain('Недостаточно');
    expect((await getAccount(c.accountId)).balance).toBe(1000);
  });

  it('проверяет день месяца и сумму автоплатежа', async () => {
    const c = await createClientWithAccount(50000);
    await pay(c.userId, { providerId: await providerId('Энергосбыт'), fromAccountId: c.accountId, amount: 1000, requisite: '12345678', templateName: 'Свет' });
    const t = (await overview(c.userId)).templates[0];
    await expect(createAutopayment(c.userId, { templateId: t.id, amount: 1000, day: 31 })).rejects.toMatchObject({ fields: { day: expect.any(String) } });
    await expect(createAutopayment(c.userId, { templateId: t.id, amount: 0, day: 5 })).rejects.toMatchObject({ fields: { amount: expect.any(String) } });
  });

  it('двойная запись сходится', async () => {
    for (const row of await trialBalance(pool)) expect(row.ok).toBe(true);
  });
});
