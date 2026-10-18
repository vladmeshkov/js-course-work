import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { pool, withTransaction } from '../src/db/pool.js';
import * as mailService from '../src/services/mailService.js';
import { notify } from '../src/services/notificationService.js';
import { createClientWithAccount, closePool } from './helpers.js';

afterAll(closePool);

const sent = [];
const fake = { sendMail: async (m) => { sent.push(m); } };
const failing = { sendMail: async () => { throw new Error('SMTP недоступен'); } };

async function clientWithEmail(email = 'anna.test@example.by') {
  const c = await createClientWithAccount(0);
  await pool.query('UPDATE clients SET email = ? WHERE id = ?', [email, c.clientId]);
  return c;
}

afterEach(() => { mailService.setTransport(null); sent.length = 0; });

describe('почта вместо SMS', () => {
  it('без настроенной почты письма не отправляются, код остаётся в учебном режиме', async () => {
    const c = await clientWithEmail();
    expect(mailService.enabled()).toBe(false);
    expect(await mailService.sendCode(c.userId, '123456', 'теста')).toBeNull();
    await notify(c.userId, { type: 'transfer', title: 'Тест', body: 'Текст' });
    expect((await pool.query('SELECT count(*) AS n FROM mail_outbox WHERE user_id = ?', [c.userId])).rows[0].n).toBe(0);
  });

  it('код подтверждения уходит письмом, адрес показывается замаскированным', async () => {
    mailService.setTransport(fake);
    const c = await clientWithEmail('anna.test@example.by');
    const masked = await mailService.sendCode(c.userId, '482901', 'подтверждения перевода');
    expect(masked).toBe('a***@example.by');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('anna.test@example.by');
    expect(sent[0].subject).toContain('482901');
    expect(sent[0].text).toContain('подтверждения перевода');
  });

  it('если у клиента нет почты или отправка не удалась, код не считается отправленным', async () => {
    mailService.setTransport(fake);
    const noMail = await createClientWithAccount(0);
    expect(await mailService.sendCode(noMail.userId, '111111', 'теста')).toBeNull();
    mailService.setTransport(failing);
    const c = await clientWithEmail();
    expect(await mailService.sendCode(c.userId, '222222', 'теста')).toBeNull();
  });

  it('уведомление ставится в очередь вместе с событием и уходит при отправке очереди', async () => {
    mailService.setTransport(fake);
    const c = await clientWithEmail();
    await notify(c.userId, { type: 'transfer', title: 'Перевод выполнен', body: 'Списано 10,00 BYN' });
    const { rows } = await pool.query("SELECT status, subject FROM mail_outbox WHERE user_id = ?", [c.userId]);
    expect(rows).toEqual([{ status: 'pending', subject: 'Перевод выполнен' }]);
    const stats = await mailService.processOutbox();
    expect(stats.sent).toBeGreaterThanOrEqual(1);
    expect(sent.some((m) => m.subject === 'Перевод выполнен')).toBe(true);
    expect((await pool.query('SELECT status FROM mail_outbox WHERE user_id = ?', [c.userId])).rows[0].status).toBe('sent');
  });

  it('при откате операции письмо в очередь не попадает', async () => {
    mailService.setTransport(fake);
    const c = await clientWithEmail();
    await expect(withTransaction(async (db) => {
      await notify(c.userId, { type: 'transfer', title: 'Не должно уйти', body: '' }, db);
      throw new Error('откат');
    })).rejects.toThrow('откат');
    expect((await pool.query('SELECT count(*) AS n FROM mail_outbox WHERE user_id = ?', [c.userId])).rows[0].n).toBe(0);
  });

  it('клиент может отключить письма, неудачные письма повторяются и после пяти попыток помечаются неотправленными', async () => {
    mailService.setTransport(fake);
    const off = await clientWithEmail();
    await pool.query('UPDATE users SET notify_email = false WHERE id = ?', [off.userId]);
    await notify(off.userId, { type: 'transfer', title: 'Выключено', body: '' });
    expect((await pool.query('SELECT count(*) AS n FROM mail_outbox WHERE user_id = ?', [off.userId])).rows[0].n).toBe(0);

    const c = await clientWithEmail();
    await notify(c.userId, { type: 'loan', title: 'Платёж по кредиту', body: '' });
    mailService.setTransport(failing);
    for (let i = 0; i < 5; i++) await mailService.processOutbox();
    const { rows: [row] } = await pool.query('SELECT status, attempts, last_error FROM mail_outbox WHERE user_id = ?', [c.userId]);
    expect(row).toMatchObject({ status: 'failed', attempts: 5, last_error: 'SMTP недоступен' });
  });
});
