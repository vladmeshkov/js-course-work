import { withTransaction, pool } from '../db/pool.js';
import { config } from '../config/index.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { daysBetween } from '../lib/dates.js';
import { interestForPeriod } from '../lib/interest.js';
import { buildIban } from '../lib/iban.js';
import { percentOf } from '../lib/money.js';
import { buildSchedule, dueDatesFrom, rebuildAfterPrepayment } from '../lib/schedule.js';
import { scoreApplication } from '../lib/scoring.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as loanModel from '../models/loanModel.js';
import * as settingsModel from '../models/settingsModel.js';
import { BALANCE_CODES, ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import { notify, money } from './notificationService.js';
import * as scoringService from './scoringService.js';
import * as ledgerService from './ledgerService.js';
import * as otpService from './otpService.js';

/*
 * Кредит. Жизненный цикл:
 *   заявка -> скоринг -> (одобрена | ручное рассмотрение | отказ) -> подписание договора кодом -> выдача ->
 *   обслуживание по графику при закрытии операционного дня -> погашение (плановое, частичное, полное).
 *
 * Учёт: ссудный счёт клиента (вид «loan») показывает долг отрицательным остатком.
 * Выдача: Дт ссудный счёт, Кт текущий счёт клиента. Погашение долга: Дт текущий счёт, Кт ссудный.
 * Проценты и пеня: Дт текущий счёт, Кт доходы банка.
 */

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError('Кредиты доступны после проверки анкеты сотрудником банка');
  return client;
}

async function bankDate(db = pool) {
  const { rows } = await db.query('SELECT bank_date FROM bank_state');
  return rows[0].bank_date;
}

function ageOn(birthDate, date) {
  const b = String(birthDate).slice(0, 10);
  let age = Number(date.slice(0, 4)) - Number(b.slice(0, 4));
  if (date.slice(5) < b.slice(5)) age -= 1;
  return age;
}

/** График по параметрам заявки, для расчёта и показа. */
export async function previewSchedule({ productId, amount, termMonths, type }) {
  const product = await loanModel.findProduct(productId);
  if (!product) throw new ValidationError({ productId: 'Выберите кредит' });
  checkTerms(product, amount, termMonths, type);
  const date = await bankDate();
  const rows = buildSchedule({ principal: amount, annualPercent: Number(product.rate_percent), type, dueDates: dueDatesFrom(date, termMonths) });
  return { product, rows, startDate: date };
}

function checkTerms(product, amount, termMonths, type) {
  const errors = {};
  if (!Number.isSafeInteger(amount) || amount < product.min_amount || amount > product.max_amount) {
    errors.amount = `Сумма от ${product.min_amount / 100} до ${product.max_amount / 100} BYN`;
  }
  if (!Number.isInteger(termMonths) || termMonths < product.min_term || termMonths > product.max_term) {
    errors.termMonths = `Срок от ${product.min_term} до ${product.max_term} месяцев`;
  }
  if (!['annuity', 'differentiated'].includes(type)) errors.scheduleType = 'Выберите вид платежей';
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

async function limits() {
  return {
    maxDti: await settingsModel.getNumber('loan.max_dti_percent'),
    autoLimit: await settingsModel.getNumber('loan.auto_limit'),
    approve: await settingsModel.getNumber('loan.score_approve'),
    manual: await settingsModel.getNumber('loan.score_manual')
  };
}

/**
 * Подача заявки. Скоринг выполняется сразу: заявка получает статус «одобрена», «ручное рассмотрение» или «отказ».
 * @param {number} userId
 * @param {{productId:number, amount:number, termMonths:number, scheduleType:string, targetAccountId:number, income:number, obligations:number, experienceMonths:number, dependents:number}} input
 */
export async function apply(userId, input) {
  const client = await verifiedClient(userId);
  const product = await loanModel.findProduct(input.productId);
  if (!product) throw new ValidationError({ productId: 'Выберите кредит' });
  checkTerms(product, input.amount, input.termMonths, input.scheduleType);

  const errors = {};
  if (!Number.isSafeInteger(input.income) || input.income <= 0) errors.income = 'Укажите ежемесячный доход';
  if (!Number.isSafeInteger(input.obligations) || input.obligations < 0) errors.obligations = 'Укажите платежи по кредитам или 0';
  if (!Number.isInteger(input.experienceMonths) || input.experienceMonths < 0) errors.experienceMonths = 'Укажите стаж в месяцах';
  if (!Number.isInteger(input.dependents) || input.dependents < 0) errors.dependents = 'Укажите число иждивенцев';
  const target = await accountModel.findById(input.targetAccountId);
  if (!target || target.owner_client_id !== client.id || target.status !== 'open' || target.currency !== 'BYN' || !['current', 'savings'].includes(target.kind)) {
    errors.targetAccountId = 'Выберите счёт в BYN для зачисления кредита';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const today = await bankDate();
  const rate = Number(product.rate_percent);
  const first = buildSchedule({ principal: input.amount, annualPercent: rate, type: input.scheduleType, dueDates: dueDatesFrom(today, input.termMonths) })[0];
  const scoringInput = {
    age: ageOn(client.birth_date, today), income: input.income, obligations: input.obligations, newPayment: first.total,
    experienceMonths: input.experienceMonths, dependents: input.dependents, amount: input.amount, limits: await limits()
  };
  const card = scoreApplication(scoringInput);
  // регрессионная модель принимает решение, если она обучена и включена; иначе работает балльная карта
  const model = (await settingsModel.getNumber('loan.scoring_regression')) === 1 ? await scoringService.activeModel() : null;
  const result = model ? await scoringService.assess(model, { ...scoringInput, dti: card.dti }, scoringInput.limits) : card;
  const status = { approve: 'approved', manual: 'manual_review', reject: 'rejected' }[result.decision];
  const comment = result.decision === 'reject'
    ? (result.dti > (await limits()).maxDti ? `Долговая нагрузка ${result.dti} % выше допустимой (Инструкция Нацбанка № 149)` : (model ? `Высокая вероятность дефолта по модели: ${String(result.pdPercent).replace('.', ',')} %` : 'Низкий скоринговый балл'))
    : null;

  return withTransaction(async (db) => {
    const application = await loanModel.insertApplication(db, {
      clientId: client.id, productId: product.id, targetAccountId: target.id, amount: input.amount, termMonths: input.termMonths,
      scheduleType: input.scheduleType, rate, income: input.income, obligations: input.obligations,
      experienceMonths: input.experienceMonths, dependents: input.dependents, firstPayment: first.total,
      dti: result.dti, score: result.score, notes: result.notes, status, comment, pdPercent: result.pdPercent ?? null, modelVersion: result.modelVersion ?? null
    });
    const texts = { approved: ['Кредит одобрен', 'Подпишите договор, чтобы получить деньги.'], manual_review: ['Заявка на рассмотрении', 'Её проверит кредитный специалист.'], rejected: ['Отказ по заявке на кредит', comment ?? ''] }[status];
    await notify(userId, { type: 'loan', title: texts[0], body: `Заявка № ${application.id}, ${money(input.amount)}. ${texts[1]}`, link: `/loans/applications/${application.id}` }, db);
    await auditService.log({ userId, action: 'loan.apply', entity: 'loan_application', entityId: application.id, details: { status, score: result.score } }, db);
    return application;
  });
}

/** Решение кредитного специалиста по заявке на ручном рассмотрении. */
export function decide(officerId, applicationId, { approve, comment }) {
  return withTransaction(async (db) => {
    const application = await loanModel.lockApplication(db, applicationId);
    if (!application) throw new AppError('Заявка не найдена', 404);
    if (application.status !== 'manual_review') throw new BusinessError('Заявка уже рассмотрена');
    if (!approve && !String(comment ?? '').trim()) throw new ValidationError({ comment: 'Укажите причину отказа' });
    await loanModel.decideApplication(db, applicationId, { status: approve ? 'approved' : 'rejected', comment: String(comment ?? '').trim() || null, userId: officerId });
    await notify((await db.query('SELECT user_id FROM clients WHERE id = $1', [application.client_id])).rows[0].user_id, { type: 'loan', title: approve ? 'Кредит одобрен' : 'Отказ по заявке на кредит', body: approve ? `Заявка № ${applicationId}. Подпишите договор, чтобы получить деньги.` : `Заявка № ${applicationId}. Причина: ${String(comment).trim()}`, link: `/loans/applications/${applicationId}` }, db);
    await auditService.log({ userId: officerId, action: approve ? 'loan.approve' : 'loan.reject', entity: 'loan_application', entityId: applicationId }, db);
  });
}

export const queue = () => loanModel.listByStatus('manual_review');
export const reviewApplication = (id) => loanModel.findApplication(id);

export async function applicationForClient(userId, id) {
  const client = await clientModel.findByUserId(userId);
  const application = await loanModel.findApplication(id);
  if (!client || !application || application.client_id !== client.id) throw new AppError('Заявка не найдена', 404);
  return application;
}

/** Отправка кода для подписания договора. */
export async function requestSignCode(userId, applicationId) {
  const application = await applicationForClient(userId, applicationId);
  if (application.status !== 'approved') throw new BusinessError('Подписать можно только одобренную заявку');
  return otpService.issue(userId, `loan:${applicationId}`);
}

/** Подписание договора кодом и выдача кредита. */
export async function sign(userId, applicationId, code) {
  const application = await applicationForClient(userId, applicationId);
  if (application.status !== 'approved') throw new BusinessError('Подписать можно только одобренную заявку');
  await otpService.verify(userId, `loan:${applicationId}`, code);
  return withTransaction(async (db) => {
    const locked = await loanModel.lockApplication(db, applicationId);
    if (locked.status !== 'approved') throw new BusinessError('Заявка уже обработана');
    const today = await bankDate(db);
    const number = await accountModel.nextNumber(db);
    const account = await accountModel.insert(db, {
      iban: buildIban(config.bankCode, BALANCE_CODES.loan, number), ownerClientId: locked.client_id, balanceCode: BALANCE_CODES.loan,
      kind: 'loan', title: `Ссудный счёт, договор по заявке № ${locked.id}`, currency: 'BYN'
    });
    const loan = await loanModel.insertLoan(db, {
      applicationId: locked.id, clientId: locked.client_id, accountId: account.id, payoutAccountId: locked.target_account_id,
      amount: locked.amount, rate: locked.rate_percent, termMonths: locked.term_months, scheduleType: locked.schedule_type, openedDate: today
    });
    const rows = buildSchedule({ principal: locked.amount, annualPercent: Number(locked.rate_percent), type: locked.schedule_type, dueDates: dueDatesFrom(today, locked.term_months) });
    await loanModel.insertInstallments(db, loan.id, rows);
    await ledgerService.post({
      type: 'loan_issue', description: `Выдача кредита, договор № ${loan.id}`, initiatedBy: userId,
      entries: [{ debit: account.id, credit: locked.target_account_id, amount: locked.amount, currency: 'BYN' }]
    }, db);
    await loanModel.setApplicationStatus(db, locked.id, 'signed');
    await notify(userId, { type: 'loan', title: 'Кредит выдан', body: `${money(locked.amount)} зачислено на счёт. Первый платёж ${money(rows[0].total)} ${rows[0].dueDate}.`, link: `/loans/${loan.id}` }, db);
    await auditService.log({ userId, action: 'loan.issue', entity: 'loan', entityId: loan.id, details: { amount: locked.amount } }, db);
    return loan;
  });
}

export async function listForClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client) return { loans: [], applications: [] };
  return { loans: await loanModel.listLoansByClient(client.id), applications: await loanModel.listApplicationsByClient(client.id) };
}

/** Кредит с графиком и числом дней просрочки. */
export async function getLoan(userId, id) {
  const client = await clientModel.findByUserId(userId);
  const loan = client ? await loanModel.findLoanForClient(id, client.id) : null;
  if (!loan) throw new AppError('Кредит не найден', 404);
  const schedule = await loanModel.schedule(loan.id);
  const today = await bankDate();
  const overdue = schedule.filter((r) => r.status === 'overdue');
  const dpd = overdue.length ? daysBetween(String(overdue[0].due_date).slice(0, 10), today) : 0;
  const next = schedule.find((r) => r.status === 'planned' || r.status === 'overdue') ?? null;
  const quote = loan.status === 'active' ? quoteFull(loan, schedule, today) : null;
  return { loan, schedule, dpd, next, quote, today };
}

/** Сумма полного досрочного погашения: долг, проценты с даты последней оплаты и начисленная пеня. */
export function quoteFull(loan, schedule, today) {
  const interest = interestForPeriod(loan.principal_balance, Number(loan.rate_percent), String(loan.last_paid_date).slice(0, 10), today);
  const penalty = schedule.filter((r) => r.status === 'overdue').reduce((t, r) => t + r.penalty, 0);
  return { principal: loan.principal_balance, interest, penalty, total: loan.principal_balance + interest + penalty };
}

async function chargeInstallment(db, loan, row, penalty) {
  const income = await ensureInternalAccount(db, 'income', 'BYN');
  const entries = [];
  if (row.principal > 0) entries.push({ debit: loan.payout_account_id, credit: loan.account_id, amount: row.principal, currency: 'BYN' });
  if (row.interest + penalty > 0) entries.push({ debit: loan.payout_account_id, credit: income.id, amount: row.interest + penalty, currency: 'BYN' });
  await ledgerService.post({ type: 'loan_payment', description: `Платёж по кредиту, договор № ${loan.id}, № ${row.no}`, entries }, db);
}

async function canPay(db, accountId, amount) {
  const account = await accountModel.findById(accountId, db);
  if (account.status !== 'open') return false;
  return account.balance - (await accountModel.heldAmount(db, accountId)) - account.min_balance >= amount;
}

/**
 * Обслуживание кредитов при закрытии операционного дня.
 * Платёж, срок которого наступил, списывается со счёта клиента. Если денег не хватает, платёж уходит на просрочку,
 * по нему каждый день начисляется пеня, а списание повторяется при следующих закрытиях дня.
 * @param {import('pg').PoolClient} db
 * @param {string} date
 * @returns {Promise<{paid:number, overdue:number, closed:number}>}
 */
export async function processLoans(db, date) {
  const penaltyPercent = await settingsModel.getNumber('loan.penalty_percent_day', db);
  const stats = { paid: 0, overdue: 0, closed: 0 };
  for (const loan of await loanModel.lockActiveLoans(db)) {
    let paidLast = null;
    for (const row of await loanModel.dueInstallments(db, loan.id, date)) {
      const due = String(row.due_date).slice(0, 10);
      let penalty = row.penalty;
      if (row.status === 'overdue') {
        const from = row.penalty_from ? String(row.penalty_from).slice(0, 10) : due;
        const days = daysBetween(from, date);
        if (days > 0) penalty += percentOf((row.principal + row.interest) * days, penaltyPercent);
      }
      const total = row.principal + row.interest + penalty;
      if (await canPay(db, loan.payout_account_id, total)) {
        await chargeInstallment(db, loan, row, penalty);
        await loanModel.markInstallment(db, row.id, { status: 'paid', paid_date: date, penalty, penalty_from: null });
        loan.principal_balance -= row.principal;
        paidLast = due;
        stats.paid += 1;
        await notify(loan.user_id, { type: 'loan', title: 'Списан платёж по кредиту', body: `Договор № ${loan.id}: ${money(total)}${penalty ? `, в том числе пеня ${money(penalty)}` : ''}`, link: `/loans/${loan.id}` }, db);
      } else {
        await loanModel.markInstallment(db, row.id, { status: 'overdue', penalty, penalty_from: date });
        if (row.status === 'planned') {
          await notify(loan.user_id, { type: 'loan', title: 'Просрочен платёж по кредиту', body: `Договор № ${loan.id}: на счёте не хватило ${money(total)}. Пополните счёт, начисляется пеня.`, link: `/loans/${loan.id}` }, db);
        }
        stats.overdue += 1;
      }
    }
    if (paidLast) {
      const patch = { principal_balance: loan.principal_balance, last_paid_date: paidLast };
      const left = (await loanModel.schedule(loan.id, db)).filter((r) => r.status === 'planned' || r.status === 'overdue');
      if (!left.length && loan.principal_balance === 0) {
        patch.status = 'closed';
        patch.closed_date = date;
        await db.query("UPDATE accounts SET status = 'closed', closed_at = now() WHERE id = $1", [loan.account_id]);
        stats.closed += 1;
      }
      await loanModel.updateLoan(db, loan.id, patch);
    }
  }
  return stats;
}

/** Полное досрочное погашение. */
export async function repayFull(userId, loanId) {
  const client = await verifiedClient(userId);
  return withTransaction(async (db) => {
    const loan = await loanModel.lockLoan(db, loanId);
    if (!loan || loan.client_id !== client.id) throw new AppError('Кредит не найден', 404);
    if (loan.status !== 'active') throw new BusinessError('Кредит уже погашен');
    const today = await bankDate(db);
    const schedule = await loanModel.schedule(loan.id, db);
    const q = quoteFull(loan, schedule, today);
    const income = await ensureInternalAccount(db, 'income', 'BYN');
    const entries = [{ debit: loan.payout_account_id, credit: loan.account_id, amount: q.principal, currency: 'BYN' }];
    if (q.interest + q.penalty > 0) entries.push({ debit: loan.payout_account_id, credit: income.id, amount: q.interest + q.penalty, currency: 'BYN' });
    await ledgerService.post({ type: 'loan_payoff', description: `Полное погашение кредита, договор № ${loan.id}`, initiatedBy: userId, entries }, db);
    await loanModel.cancelPlanned(db, loan.id);
    await loanModel.updateLoan(db, loan.id, { principal_balance: 0, status: 'closed', closed_date: today, last_paid_date: today });
    await db.query("UPDATE accounts SET status = 'closed', closed_at = now() WHERE id = $1", [loan.account_id]);
    await notify(userId, { type: 'loan', title: 'Кредит погашен', body: `Договор № ${loan.id}: списано ${money(q.total)}`, link: '/loans' }, db);
    await auditService.log({ userId, action: 'loan.payoff', entity: 'loan', entityId: loan.id, details: { total: q.total } }, db);
    return q;
  });
}

/**
 * Частичное досрочное погашение: гасится часть долга и проценты за прошедшие дни.
 * mode 'term' сокращает срок при прежнем платеже, 'payment' уменьшает платёж при прежнем сроке.
 * @param {number} userId
 * @param {number} loanId
 * @param {{amount:number, mode:'term'|'payment'}} p amount: сумма в погашение долга, копейки
 */
export async function repayPartial(userId, loanId, { amount, mode }) {
  const client = await verifiedClient(userId);
  if (!['term', 'payment'].includes(mode)) throw new ValidationError({ mode: 'Выберите, что уменьшить: срок или платёж' });
  return withTransaction(async (db) => {
    const loan = await loanModel.lockLoan(db, loanId);
    if (!loan || loan.client_id !== client.id) throw new AppError('Кредит не найден', 404);
    if (loan.status !== 'active') throw new BusinessError('Кредит уже погашен');
    const schedule = await loanModel.schedule(loan.id, db);
    if (schedule.some((r) => r.status === 'overdue')) throw new BusinessError('Сначала погасите просроченные платежи');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError({ amount: 'Введите сумму больше нуля' });
    if (amount >= loan.principal_balance) throw new ValidationError({ amount: 'Сумма не меньше остатка долга. Выберите полное погашение' });

    const today = await bankDate(db);
    const accrued = interestForPeriod(loan.principal_balance, Number(loan.rate_percent), String(loan.last_paid_date).slice(0, 10), today);
    const income = await ensureInternalAccount(db, 'income', 'BYN');
    const entries = [{ debit: loan.payout_account_id, credit: loan.account_id, amount, currency: 'BYN' }];
    if (accrued > 0) entries.push({ debit: loan.payout_account_id, credit: income.id, amount: accrued, currency: 'BYN' });
    await ledgerService.post({ type: 'loan_partial', description: `Частичное досрочное погашение, договор № ${loan.id}`, initiatedBy: userId, entries }, db);

    const remaining = schedule.filter((r) => r.status === 'planned');
    const newBalance = loan.principal_balance - amount;
    const nextDue = String(remaining[0].due_date).slice(0, 10);
    const currentPayment = loan.schedule_type === 'annuity' ? remaining[0].principal + remaining[0].interest : Math.floor(loan.principal_balance / remaining.length);
    const rows = rebuildAfterPrepayment({
      balance: newBalance, annualPercent: Number(loan.rate_percent), type: loan.schedule_type, mode,
      dueDates: remaining.map((r) => String(r.due_date).slice(0, 10)), currentPayment, firstNo: remaining[0].no,
      firstInterest: interestForPeriod(newBalance, Number(loan.rate_percent), today, nextDue)
    });
    await loanModel.deletePlanned(db, loan.id);
    await loanModel.insertInstallments(db, loan.id, rows);
    await loanModel.updateLoan(db, loan.id, { principal_balance: newBalance, last_paid_date: today });
    await notify(userId, { type: 'loan', title: 'Досрочный платёж принят', body: `Договор № ${loan.id}: остаток долга ${money(newBalance)}, график пересчитан`, link: `/loans/${loan.id}` }, db);
    await auditService.log({ userId, action: 'loan.partial', entity: 'loan', entityId: loan.id, details: { amount, mode } }, db);
    return { paid: amount + accrued, accrued, newBalance, installments: rows.length };
  });
}

/**
 * Напоминания о предстоящих платежах: за 3 дня до даты платежа, один раз по каждому платежу.
 * @returns {Promise<number>} сколько напоминаний отправлено
 */
export async function sendReminders(db, date) {
  const { rows } = await db.query(
    `SELECT s.id, s.loan_id, s.due_date, s.principal, s.interest, c.user_id
     FROM loan_schedule s JOIN loans l ON l.id = s.loan_id JOIN clients c ON c.id = l.client_id
     WHERE s.status = 'planned' AND NOT s.reminded AND l.status = 'active' AND s.due_date > $1 AND s.due_date <= $2::date + 3
     ORDER BY s.id`, [date, date]);
  for (const r of rows) {
    await notify(r.user_id, { type: 'loan', title: 'Скоро платёж по кредиту', body: `Договор № ${r.loan_id}: ${money(r.principal + r.interest)} до ${String(r.due_date).slice(0, 10)}. Проверьте остаток на счёте.`, link: `/loans/${r.loan_id}` }, db);
    await db.query('UPDATE loan_schedule SET reminded = true WHERE id = $1', [r.id]);
  }
  return rows.length;
}
