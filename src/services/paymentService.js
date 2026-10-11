import { withTransaction } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { addMonths, addDays } from '../lib/dates.js';
import { percentOf } from '../lib/money.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as paymentModel from '../models/paymentModel.js';
import { ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import { notify, money } from './notificationService.js';
import * as ledgerService from './ledgerService.js';

/*
 * Оплата услуг по каталогу (по образцу ЕРИП): категория -> город -> поставщик -> реквизит и сумма.
 * Деньги зачисляются на внутренний счёт поставщика, комиссия (если есть) идёт в доход банка.
 * Шаблоны хранят поставщика, реквизит и счёт; автоплатёж выполняется по шаблону при закрытии операционного дня.
 */

async function verifiedClient(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError('Платежи доступны после проверки анкеты сотрудником банка');
  return client;
}

export const catalog = {
  categories: paymentModel.categories,
  category: paymentModel.category,
  cities: paymentModel.cities,
  providers: paymentModel.providers,
  provider: paymentModel.provider
};

/** Проверяет реквизит по маске поставщика. Возвращает текст ошибки или null. */
export function checkRequisite(provider, requisite) {
  return new RegExp(provider.requisite_regex).test(requisite) ? null : `${provider.requisite_label}: ${provider.requisite_hint || 'неверный формат'}`;
}

/**
 * Проводит платёж внутри транзакции db. Используется и для ручной оплаты, и для автоплатежей.
 */
export async function executePayment(db, { client, userId, providerId, fromAccountId, amount, requisite, source = 'manual' }) {
  const provider = await paymentModel.provider(providerId, db);
  if (!provider) throw new ValidationError({ providerId: 'Поставщик не найден' });
  const errors = {};
  const req = String(requisite ?? '').trim().toUpperCase().replace(/\s/g, '');
  const reqError = checkRequisite(provider, req);
  if (reqError) errors.requisite = reqError;
  if (!Number.isSafeInteger(amount) || amount < provider.min_amount || amount > provider.max_amount) {
    errors.amount = `Сумма от ${provider.min_amount / 100} до ${provider.max_amount / 100} BYN`;
  }
  const from = await accountModel.findById(fromAccountId, db);
  if (!from || from.owner_client_id !== client.id || from.status !== 'open' || from.currency !== 'BYN' || !['current', 'savings'].includes(from.kind)) {
    errors.fromAccountId = 'Выберите счёт в BYN';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const fee = percentOf(amount, Number(provider.fee_percent));
  const providerAccount = await ensureInternalAccount(db, `provider_${provider.id}`, 'BYN');
  const entries = [{ debit: from.id, credit: providerAccount.id, amount, currency: 'BYN' }];
  if (fee > 0) entries.push({ debit: from.id, credit: (await ensureInternalAccount(db, 'income', 'BYN')).id, amount: fee, currency: 'BYN' });
  const { documentId } = await ledgerService.post({
    type: 'payment', description: `Оплата: ${provider.name}, ${provider.requisite_label.toLowerCase()} ${req}`, initiatedBy: userId, entries
  }, db);
  const payment = await paymentModel.insertPayment(db, { clientId: client.id, providerId: provider.id, fromAccountId: from.id, amount, fee, requisite: req, documentId, source });
  if (source === 'autopay') await notify(userId, { type: 'payment', title: 'Выполнен автоплатёж', body: `${provider.name}: ${money(amount)}`, link: `/payments/${payment.id}/receipt` }, db);
  await auditService.log({ userId, action: 'payment.done', entity: 'payment', entityId: payment.id, details: { provider: provider.name, amount, source } }, db);
  return payment;
}

/** Ручная оплата услуги. Если указано имя шаблона, платёж сохраняется как шаблон. */
export async function pay(userId, input) {
  const client = await verifiedClient(userId);
  return withTransaction(async (db) => {
    const payment = await executePayment(db, { client, userId, ...input });
    if (input.templateName?.trim()) {
      await paymentModel.insertTemplate(db, {
        clientId: client.id, providerId: payment.provider_id, fromAccountId: payment.from_account_id,
        name: input.templateName.trim().slice(0, 60), requisite: payment.requisite, amount: input.saveAmount ? payment.amount : null
      });
    }
    return payment;
  });
}

export async function overview(userId) {
  const client = await clientModel.findByUserId(userId);
  if (!client) return { templates: [], autopayments: [], recent: [] };
  return { templates: await paymentModel.templates(client.id), autopayments: await paymentModel.autopayments(client.id), recent: await paymentModel.recent(client.id) };
}

export async function historyFor(userId, providerId) {
  const client = await clientModel.findByUserId(userId);
  return client ? paymentModel.historyFor(client.id, providerId) : [];
}

export async function getReceipt(userId, id) {
  const client = await clientModel.findByUserId(userId);
  const receipt = client ? await paymentModel.receipt(id, client.id) : null;
  if (!receipt) throw new AppError('Платёж не найден', 404);
  return receipt;
}

export async function getTemplate(userId, id) {
  const client = await verifiedClient(userId);
  const template = await paymentModel.template(id, client.id);
  if (!template) throw new AppError('Шаблон не найден', 404);
  return template;
}

export async function removeTemplate(userId, id) {
  const client = await verifiedClient(userId);
  await paymentModel.deleteTemplate(client.id, id);
}

/**
 * Автоплатёж по шаблону: каждый месяц в выбранный день.
 * @param {{templateId:number, amount:number, day:number}} input
 */
export async function createAutopayment(userId, { templateId, amount, day }) {
  const client = await verifiedClient(userId);
  const template = await paymentModel.template(templateId, client.id);
  if (!template) throw new AppError('Шаблон не найден', 404);
  const errors = {};
  if (!Number.isSafeInteger(amount) || amount <= 0) errors.amount = 'Введите сумму больше нуля';
  if (!Number.isInteger(day) || day < 1 || day > 28) errors.day = 'День месяца от 1 до 28';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return withTransaction(async (db) => {
    const { rows: [state] } = await db.query('SELECT bank_date FROM bank_state');
    const today = String(state.bank_date).slice(0, 10);
    // ближайшая дата: в этом месяце, если день ещё не прошёл, иначе в следующем
    const thisMonth = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
    const nextDate = thisMonth > today ? thisMonth : addMonths(thisMonth, 1);
    const auto = await paymentModel.insertAutopayment(db, { clientId: client.id, templateId, amount, day, nextDate });
    await auditService.log({ userId, action: 'autopay.create', entity: 'autopayment', entityId: auto.id }, db);
    return auto;
  });
}

export async function cancelAutopayment(userId, id) {
  const client = await verifiedClient(userId);
  await paymentModel.cancelAutopayment(client.id, id);
}

const MAX_FAILS = 3;

/**
 * Выполнение автоплатежей при закрытии операционного дня. Неудачу (нет денег) повторяем на следующий день,
 * после трёх неудач подряд автоплатёж отключается.
 * @returns {Promise<{done:number, failed:number}>}
 */
export async function processAutopayments(db, date) {
  const stats = { done: 0, failed: 0 };
  for (const a of await paymentModel.dueAutopayments(db, date)) {
    const client = { id: a.client_id };
    await db.query('SAVEPOINT autopay');
    try {
      await executePayment(db, { client, userId: a.user_id, providerId: a.provider_id, fromAccountId: a.from_account_id, amount: a.amount, requisite: a.requisite, source: 'autopay' });
      await db.query('RELEASE SAVEPOINT autopay');
      await paymentModel.saveAutopayment(db, a.id, { next_date: addMonths(`${date.slice(0, 8)}${String(a.day_of_month).padStart(2, '0')}`, 1), fail_count: 0, last_result: 'Выполнен' });
      stats.done += 1;
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT autopay');
      const fails = a.fail_count + 1;
      await paymentModel.saveAutopayment(db, a.id, {
        fail_count: fails, last_result: error.message, next_date: addDays(date, 1), active: fails < MAX_FAILS
      });
      await notify(a.user_id, { type: 'payment', title: 'Автоплатёж не выполнен', body: `${error.message}. Попробуем завтра, всего попыток: ${MAX_FAILS}.`, link: '/payments' }, db);
      stats.failed += 1;
    }
  }
  return stats;
}
