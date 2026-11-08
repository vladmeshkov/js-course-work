import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { pool } from '../../server/db/pool.js';
import { hashPassword } from '../../server/modules/auth/auth.service.js';
import * as userModel from '../../server/modules/auth/user.model.js';
import { createClientWithAccount, getAccount, closePool } from '../helpers.js';
import { apiClient, loggedIn } from '../http.js';

afterAll(closePool);

const app = createApp();
const PASSWORD = 'Parol2026';

const depositId = async (name) => (await pool.query('SELECT id FROM deposit_products WHERE name = ?', [name])).rows[0].id;
const loanProductId = async () => (await pool.query("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'")).rows[0].id;

/** Клиент с проверенной анкетой, счётом и входом в систему. */
async function clientSession(balance = 500000) {
  const hash = await hashPassword(PASSWORD);
  const c = await createClientWithAccount(balance, 'BYN', hash);
  await pool.query("UPDATE clients SET birth_date = '1990-05-05' WHERE id = ?", [c.clientId]);
  return { ...c, api: await loggedIn(app, c.login, PASSWORD) };
}

/** Сотрудник с ролью (кредитный специалист или другая) и вход. */
async function staffSession(roleCode, login) {
  await userModel.create(pool, { login, passwordHash: await hashPassword(PASSWORD), roleCode });
  return loggedIn(app, login, PASSWORD);
}

const loanForm = async (c, extra = {}) => ({
  productId: await loanProductId(), amount: '3000,00', termMonths: 12, scheduleType: 'annuity', targetAccountId: c.accountId,
  income: '3000,00', obligations: '', experienceMonths: 60, dependents: 0, ...extra
});


describe('заявка на кредит через API', () => {
  it('страница заявки отдаёт продукт и счета в BYN', async () => {
    const c = await clientSession();
    const p = await loanProductId();
    const res = await c.api.get(`/loans/new?product=${p}`);
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(p);
    expect(res.body.accounts.map((a) => a.id)).toEqual([c.accountId]);
    expect((await c.api.get('/loans/new?product=999999')).status).toBe(404);
  });

  it('ошибки заявки приходят полями 422', async () => {
    const c = await clientSession();
    const text = await c.api.post('/loans', await loanForm(c, { amount: 'много', income: 'нет' }));
    expect(text.status).toBe(422);
    expect(text.body.error.fields).toMatchObject({ amount: expect.any(String), income: expect.any(String) });
    const small = await c.api.post('/loans', await loanForm(c, { amount: '1,00', termMonths: 1 }));
    expect(small.status).toBe(422);
    expect(small.body.error.fields).toMatchObject({ amount: expect.any(String), termMonths: expect.any(String) });
    const noExperience = await c.api.post('/loans', await loanForm(c, { experienceMonths: -3 }));
    expect(noExperience.status).toBe(422);
    expect(noExperience.body.error.fields.experienceMonths).toBeTruthy();
    const noAccount = await c.api.post('/loans', await loanForm(c, { targetAccountId: 999999 }));
    expect(noAccount.body.error.fields.targetAccountId).toBeTruthy();
  });

  it('скоринг: надёжный клиент одобрен, высокая нагрузка даёт отказ, крупная сумма идёт специалисту', async () => {
    const good = await clientSession();
    const ok = await good.api.post('/loans', await loanForm(good));
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('approved');

    const heavy = await clientSession();
    const bad = await heavy.api.post('/loans', await loanForm(heavy, { income: '1000,00', obligations: '500,00' }));
    expect(bad.body.status).toBe('rejected');
    const card = (await heavy.api.get(`/loans/applications/${bad.body.id}`)).body;
    expect(card.application.status).toBe('rejected');
    expect(card.application.decision_comment).toContain('Долговая нагрузка');
    expect(card.application.scoring_notes.length).toBeGreaterThan(0);
    expect(card.demoCode).toBeNull();

    const big = await clientSession();
    const manual = await big.api.post('/loans', await loanForm(big, { amount: '25000,00', termMonths: 36, income: '9000,00' }));
    expect(manual.body.status).toBe('manual_review');
  });

  it('подписание: код из учебного режима, неверный код отклоняется, после подписи кредит выдан', async () => {
    const c = await clientSession(0);
    const app1 = (await c.api.post('/loans', await loanForm(c))).body;
    const view = (await c.api.get(`/loans/applications/${app1.id}`)).body;
    expect(view.application).toMatchObject({ id: app1.id, status: 'approved' });
    expect(view.demoCode).toBeNull();

    const sent = await c.api.post(`/loans/applications/${app1.id}/code`);
    expect(sent.status).toBe(200);
    expect(sent.body.sentTo).toBeNull();
    expect(sent.body.demoCode).toMatch(/^\d{6}$/);
    // код остаётся в сессии: страница заявки показывает его после обновления
    expect((await c.api.get(`/loans/applications/${app1.id}`)).body.demoCode).toBe(sent.body.demoCode);

    const wrongCode = sent.body.demoCode === '000000' ? '111111' : '000000';
    const wrong = await c.api.post(`/loans/applications/${app1.id}/sign`, { code: wrongCode });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('otp_wrong');

    const signed = await c.api.post(`/loans/applications/${app1.id}/sign`, { code: sent.body.demoCode });
    expect(signed.status).toBe(200);
    expect(signed.body.id).toBeGreaterThan(0);
    expect((await getAccount(c.accountId)).balance).toBe(300000);
    expect((await c.api.get(`/loans/applications/${app1.id}`)).body.demoCode).toBeNull();
    // повторно подписать нельзя
    expect((await c.api.post(`/loans/applications/${app1.id}/code`)).status).toBe(409);
  });

  it('код подписания нельзя запросить для отклонённой заявки', async () => {
    const c = await clientSession();
    const a = (await c.api.post('/loans', await loanForm(c, { income: '1000,00', obligations: '500,00' }))).body;
    const res = await c.api.post(`/loans/applications/${a.id}/code`);
    expect(res.status).toBe(409);
  });
});

describe('кредит и погашение через API', () => {
  async function issuedLoan() {
    const c = await clientSession(0);
    const a = (await c.api.post('/loans', await loanForm(c))).body;
    const code = (await c.api.post(`/loans/applications/${a.id}/code`)).body.demoCode;
    const loanId = (await c.api.post(`/loans/applications/${a.id}/sign`, { code })).body.id;
    return { ...c, loanId };
  }

  it('карточка кредита: график, ближайший платёж, расчёт полного погашения; список «Мои кредиты»', async () => {
    const c = await issuedLoan();
    const d = (await c.api.get(`/loans/${c.loanId}`)).body;
    expect(d.loan).toMatchObject({ id: c.loanId, status: 'active', principal_balance: 300000 });
    expect(d.schedule).toHaveLength(12);
    expect(d.next.no).toBe(1);
    expect(d.dpd).toBe(0);
    expect(d.quote.principal).toBe(300000);
    expect(d.quote.total).toBe(d.quote.principal + d.quote.interest + d.quote.penalty);
    const list = (await c.api.get('/loans')).body;
    expect(list.loans.map((l) => l.id)).toEqual([c.loanId]);
    expect(list.applications.map((a) => a.status)).toEqual(['signed']);
  });

  it('частичное досрочное погашение пересчитывает график, ошибки приходят полями', async () => {
    const c = await issuedLoan();
    // деньги на счёте уже есть (кредит зачислен), для списания процентов их хватает
    const bad = await c.api.post(`/loans/${c.loanId}/repay-partial`, { amount: 'abc', mode: 'term' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.amount).toBeTruthy();
    const tooMuch = await c.api.post(`/loans/${c.loanId}/repay-partial`, { amount: '3000,00', mode: 'term' });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.fields.amount).toContain('не меньше остатка');
    const noMode = await c.api.post(`/loans/${c.loanId}/repay-partial`, { amount: '500,00', mode: 'x' });
    expect(noMode.status).toBe(422);
    expect(noMode.body.error.fields.mode).toBeTruthy();

    const ok = await c.api.post(`/loans/${c.loanId}/repay-partial`, { amount: '1000,00', mode: 'term' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ newBalance: 200000 });
    const d = (await c.api.get(`/loans/${c.loanId}`)).body;
    expect(d.loan.principal_balance).toBe(200000);
    expect(d.schedule.filter((r) => r.status === 'planned').length).toBeLessThan(12);
  });

  it('полное погашение закрывает кредит', async () => {
    const c = await issuedLoan();
    const quote = (await c.api.get(`/loans/${c.loanId}`)).body.quote;
    const res = await c.api.post(`/loans/${c.loanId}/repay-full`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(quote.total);
    const d = (await c.api.get(`/loans/${c.loanId}`)).body;
    expect(d.loan).toMatchObject({ status: 'closed', principal_balance: 0 });
    expect(d.quote).toBeNull();
    expect((await c.api.post(`/loans/${c.loanId}/repay-full`)).status).toBe(409);
  });

  it('чужой кредит и чужая заявка недоступны, без входа 401, сотруднику 403', async () => {
    const owner = await issuedLoan();
    const other = await clientSession();
    expect((await other.api.get(`/loans/${owner.loanId}`)).status).toBe(404);
    expect((await other.api.post(`/loans/${owner.loanId}/repay-full`)).status).toBe(404);
    expect((await other.api.post(`/loans/${owner.loanId}/repay-partial`, { amount: '10,00', mode: 'term' })).status).toBe(404);
    const appId = (await pool.query('SELECT application_id FROM loans WHERE id = ?', [owner.loanId])).rows[0].application_id;
    expect((await other.api.get(`/loans/applications/${appId}`)).status).toBe(404);
    expect((await other.api.post(`/loans/applications/${appId}/code`)).status).toBe(404);

    const guest = apiClient(app);
    await guest.refresh();
    expect((await guest.get(`/loans/${owner.loanId}`)).status).toBe(401);
    expect((await guest.get('/loans/new?product=1')).status).toBe(401);

    const officer = await staffSession('credit_officer', 'loan.officer.x');
    expect((await officer.get(`/loans/${owner.loanId}`)).status).toBe(403);
    expect((await officer.post('/loans', {})).status).toBe(403);
  });
});

describe('рабочее место кредитного специалиста', () => {
  async function pendingApplication() {
    const c = await clientSession();
    const a = (await c.api.post('/loans', await loanForm(c, { amount: '25000,00', termMonths: 36, income: '9000,00' }))).body;
    expect(a.status).toBe('manual_review');
    return { ...c, applicationId: a.id };
  }

  it('очередь, анкета, отказ требует причину, решение сообщается клиенту', async () => {
    const officer = await staffSession('credit_officer', 'credit.api.1');
    const c = await pendingApplication();

    const queue = (await officer.get('/staff/loans')).body.applications;
    const row = queue.find((a) => a.id === c.applicationId);
    expect(row).toMatchObject({ status: 'manual_review', last_name: 'Тестов', amount: 2500000 });

    const review = (await officer.get(`/staff/loans/${c.applicationId}`)).body.application;
    expect(review).toMatchObject({ id: c.applicationId, product_name: expect.any(String), income: 900000 });
    expect(review.scoring_notes.length).toBeGreaterThan(0);
    expect((await officer.get('/staff/loans/999999')).status).toBe(404);

    const noComment = await officer.post(`/staff/loans/${c.applicationId}`, { decision: 'reject', comment: '' });
    expect(noComment.status).toBe(422);
    expect(noComment.body.error.fields.comment).toBeTruthy();
    const noDecision = await officer.post(`/staff/loans/${c.applicationId}`, { comment: 'x' });
    expect(noDecision.status).toBe(422);
    expect(noDecision.body.error.fields.decision).toBeTruthy();

    const rejected = await officer.post(`/staff/loans/${c.applicationId}`, { decision: 'reject', comment: 'Недостаточно подтверждённого дохода' });
    expect(rejected.body).toEqual({ status: 'rejected' });
    const seen = (await c.api.get(`/loans/applications/${c.applicationId}`)).body.application;
    expect(seen).toMatchObject({ status: 'rejected', decision_comment: 'Недостаточно подтверждённого дохода' });
    expect((await officer.get('/staff/loans')).body.applications.some((a) => a.id === c.applicationId)).toBe(false);
    // повторное решение невозможно
    expect((await officer.post(`/staff/loans/${c.applicationId}`, { decision: 'approve' })).status).toBe(409);
  });

  it('одобрение позволяет клиенту подписать договор', async () => {
    const officer = await staffSession('credit_officer', 'credit.api.2');
    const c = await pendingApplication();
    const res = await officer.post(`/staff/loans/${c.applicationId}`, { decision: 'approve', comment: '' });
    expect(res.body).toEqual({ status: 'approved' });
    const code = (await c.api.post(`/loans/applications/${c.applicationId}/code`)).body.demoCode;
    const signed = await c.api.post(`/loans/applications/${c.applicationId}/sign`, { code });
    expect(signed.status).toBe(200);
    expect((await getAccount(c.accountId)).balance).toBe(500000 + 2500000);
  });

  it('без права loan.review маршруты закрыты: клиенту, гостю и другим сотрудникам', async () => {
    const c = await pendingApplication();
    const guest = apiClient(app);
    await guest.refresh();
    expect((await guest.get('/staff/loans')).status).toBe(401);
    expect((await c.api.get('/staff/loans')).status).toBe(403);
    expect((await c.api.get(`/staff/loans/${c.applicationId}`)).status).toBe(403);
    expect((await c.api.post(`/staff/loans/${c.applicationId}`, { decision: 'approve' })).status).toBe(403);
    const operator = await staffSession('operator', 'operator.api.1');
    expect((await operator.get('/staff/loans')).status).toBe(403);
    // заявка осталась на рассмотрении
    expect((await pool.query('SELECT status FROM loan_applications WHERE id = ?', [c.applicationId])).rows[0].status).toBe('manual_review');
  });
});
