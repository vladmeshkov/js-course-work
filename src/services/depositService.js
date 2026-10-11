import { withTransaction, pool } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { addMonths } from '../lib/dates.js';
import { interestForPeriod } from '../lib/interest.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as depositModel from '../models/depositModel.js';
import { BALANCE_CODES, ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import * as ledgerService from './ledgerService.js';
import { buildIban } from '../lib/iban.js';
import { config } from '../config/index.js';

/*
 * Вклад. Основная сумма лежит на отдельном счёте вклада (вид «deposit»).
 * Проценты начисляются по ежемесячным датам открытия и в день окончания срока:
 *   - с капитализацией проценты прибавляются к счёту вклада;
 *   - без капитализации проценты выплачиваются на текущий счёт клиента.
 * В день окончания срока вклад возвращается на текущий счёт, договор закрывается.
 * Досрочное расторжение (только отзывные вклады): весь срок пересчитывается по ставке «до востребования»,
 * излишне выплаченные проценты удерживаются из суммы возврата.
 */

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError('Вклады доступны после проверки анкеты сотрудником банка');
  return client;
}

async function bankDate(db) {
  const { rows } = await db.query('SELECT bank_date FROM bank_state');
  return rows[0].bank_date;
}

/**
 * Открывает вклад: создаёт счёт вклада и переводит на него сумму с текущего счёта.
 * @param {number} userId
 * @param {{productId:number, sourceAccountId:number, amount:number}} input
 */
export async function openDeposit(userId, { productId, sourceAccountId, amount }) {
  const client = await verifiedClient(userId);
  const product = await depositModel.findProduct(productId);
  if (!product) throw new ValidationError({ productId: 'Выберите вклад' });
  if (!Number.isSafeInteger(amount) || amount < product.min_amount) {
    throw new ValidationError({ amount: `Минимальная сумма вклада: ${product.min_amount / 100} ${product.currency}` });
  }
  const source = await accountModel.findById(sourceAccountId);
  if (!source || source.owner_client_id !== client.id || source.status !== 'open' || !['current', 'savings'].includes(source.kind)) {
    throw new ValidationError({ sourceAccountId: 'Выберите счёт списания' });
  }
  if (source.currency !== product.currency) {
    throw new ValidationError({ sourceAccountId: `Для этого вклада нужен счёт в ${product.currency}` });
  }

  return withTransaction(async (db) => {
    const today = await bankDate(db);
    const number = await accountModel.nextNumber(db);
    const account = await accountModel.insert(db, {
      iban: buildIban(config.bankCode, BALANCE_CODES.deposit, number),
      ownerClientId: client.id, balanceCode: BALANCE_CODES.deposit, kind: 'deposit',
      title: `Вклад «${product.name}»`, currency: product.currency
    });
    const deposit = await depositModel.insert(db, {
      clientId: client.id, productId: product.id, accountId: account.id, payoutAccountId: source.id,
      currency: product.currency, amount, rate: product.rate_percent, demandRate: product.demand_rate_percent,
      capitalization: product.capitalization, revocable: product.revocable,
      openedDate: today, maturityDate: addMonths(today, product.term_months)
    });
    await ledgerService.post({
      type: 'deposit_open', description: `Открытие вклада «${product.name}»`, initiatedBy: userId,
      entries: [{ debit: source.id, credit: account.id, amount, currency: product.currency }]
    }, db);
    await auditService.log({ userId, action: 'deposit.open', entity: 'deposit', entityId: deposit.id, details: { amount, product: product.name } }, db);
    return deposit;
  });
}

/** Ближайшая дата начисления: ежемесячная годовщина открытия, но не позже окончания срока. */
function nextPayoutDate(deposit, periodsDone) {
  const next = addMonths(deposit.opened_date, periodsDone + 1);
  return next < deposit.maturity_date ? next : deposit.maturity_date;
}

/**
 * Начисляет проценты и закрывает вклады, у которых наступили даты. Вызывается при закрытии операционного дня.
 * @param {import('pg').PoolClient} db
 * @param {string} date банковская дата, по которую (включительно) нужно выполнить начисления
 * @returns {Promise<{payouts:number, matured:number}>}
 */
export async function processDeposits(db, date) {
  let payouts = 0;
  let matured = 0;
  const due = await depositModel.lockActiveDue(db, date);
  for (const deposit of due) {
    let { paid_until: paidUntil, periods_done: periods, interest_total: total } = deposit;
    for (;;) {
      const eventDate = nextPayoutDate(deposit, periods);
      if (eventDate > date) break;
      const account = await accountModel.findById(deposit.account_id, db);
      const interest = interestForPeriod(account.balance, Number(deposit.rate_percent), paidUntil, eventDate);
      if (interest > 0) {
        const expense = await ensureInternalAccount(db, 'expense', deposit.currency);
        const target = deposit.capitalization ? deposit.account_id : deposit.payout_account_id;
        await ledgerService.post({
          type: 'deposit_interest', description: `Проценты по вкладу № ${deposit.id}`,
          entries: [{ debit: expense.id, credit: target, amount: interest, currency: deposit.currency }]
        }, db);
        total += interest;
        payouts += 1;
      }
      paidUntil = eventDate;
      periods += 1;
      if (eventDate >= deposit.maturity_date) {
        const body = (await accountModel.findById(deposit.account_id, db)).balance;
        await ledgerService.post({
          type: 'deposit_return', description: `Возврат вклада № ${deposit.id}`,
          entries: [{ debit: deposit.account_id, credit: deposit.payout_account_id, amount: body, currency: deposit.currency }]
        }, db);
        await depositModel.closeAccount(db, deposit.account_id);
        await depositModel.close(db, deposit.id, 'closed', eventDate, total);
        matured += 1;
        break;
      }
      await depositModel.saveProgress(db, deposit.id, { paidUntil, periodsDone: periods, interestTotal: total });
    }
  }
  return { payouts, matured };
}

/**
 * Расчёт досрочного расторжения: что получит клиент.
 * @returns {{demandInterest:number, paidInterest:number, adjustment:number, payout:number}}
 *   adjustment: положительное число доплаты процентов, отрицательное — удержание излишне выплаченных
 */
export function quoteEarlyClose(deposit, accountBalance, today) {
  const demandInterest = interestForPeriod(deposit.amount, Number(deposit.demand_rate_percent), deposit.opened_date, today);
  const paidInterest = deposit.interest_total;
  const adjustment = demandInterest - paidInterest;
  // выплаченные проценты у клиента уже есть, поэтому перерасход удерживается из суммы вклада
  return { demandInterest, paidInterest, adjustment, payout: Math.max(0, accountBalance + adjustment) };
}

/** Данные для экрана подтверждения досрочного расторжения. */
export async function earlyCloseQuote(userId, depositId) {
  const client = await verifiedClient(userId);
  const deposit = await depositModel.findForClient(depositId, client.id);
  if (!deposit) throw new AppError('Вклад не найден', 404);
  const today = await bankDate(pool);
  return { deposit, today, ...quoteEarlyClose(deposit, deposit.balance, today) };
}

/**
 * Досрочно расторгает отзывный вклад.
 */
export async function closeEarly(userId, depositId) {
  const client = await verifiedClient(userId);
  return withTransaction(async (db) => {
    const locked = await depositModel.lock(db, depositId);
    if (!locked || locked.client_id !== client.id) throw new AppError('Вклад не найден', 404);
    if (locked.status !== 'active') throw new BusinessError('Вклад уже закрыт');
    if (!locked.revocable) throw new BusinessError('Этот вклад безотзывный: досрочно закрыть его нельзя');
    const today = await bankDate(db);
    const account = await accountModel.findById(locked.account_id, db);
    const quote = quoteEarlyClose(locked, account.balance, today);

    const expense = await ensureInternalAccount(db, 'expense', locked.currency);
    if (quote.adjustment > 0) {
      await ledgerService.post({
        type: 'deposit_interest', description: `Проценты по ставке до востребования, вклад № ${locked.id}`,
        entries: [{ debit: expense.id, credit: locked.account_id, amount: quote.adjustment, currency: locked.currency }]
      }, db);
    } else if (quote.adjustment < 0) {
      // удержание излишне начисленных процентов обратной проводкой
      await ledgerService.post({
        type: 'deposit_clawback', description: `Удержание излишних процентов, вклад № ${locked.id}`, skipFundsCheck: true,
        entries: [{ debit: locked.account_id, credit: expense.id, amount: -quote.adjustment, currency: locked.currency }]
      }, db);
    }
    const final = (await accountModel.findById(locked.account_id, db)).balance;
    if (final > 0) {
      await ledgerService.post({
        type: 'deposit_return', description: `Возврат вклада № ${locked.id} (досрочно)`,
        entries: [{ debit: locked.account_id, credit: locked.payout_account_id, amount: final, currency: locked.currency }]
      }, db);
    }
    await depositModel.closeAccount(db, locked.account_id);
    await depositModel.close(db, locked.id, 'early_closed', today, quote.demandInterest);
    await auditService.log({ userId, action: 'deposit.close_early', entity: 'deposit', entityId: locked.id, details: { payout: final } }, db);
    return { ...quote, payout: final };
  });
}

export async function listForClient(userId) {
  const client = await clientModel.findByUserId(userId);
  return client ? depositModel.listByClient(client.id) : [];
}

export async function getForClient(userId, id) {
  const client = await clientModel.findByUserId(userId);
  const deposit = client ? await depositModel.findForClient(id, client.id) : null;
  if (!deposit) throw new AppError('Вклад не найден', 404);
  return deposit;
}

/** Прогноз дохода по условиям продукта (для калькулятора). */
export function projectIncome({ amount, ratePercent, termMonths, capitalization, openedDate }) {
  let balance = amount;
  let paidUntil = openedDate;
  let paidOut = 0;
  for (let k = 1; k <= termMonths; k++) {
    const next = addMonths(openedDate, k);
    const interest = interestForPeriod(balance, ratePercent, paidUntil, next);
    if (capitalization) balance += interest;
    else paidOut += interest;
    paidUntil = next;
  }
  return { total: balance - amount + paidOut, maturityAmount: balance + paidOut };
}
