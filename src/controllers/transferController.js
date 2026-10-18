import { AppError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import { clearDemoCode, deliverCode, demoCodeFor } from '../lib/demoCode.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as transferModel from '../models/transferModel.js';
import * as accountService from '../services/accountService.js';
import * as transferService from '../services/transferService.js';

/** Счёт для экрана: только то, что нужно форме и подтверждению. */
const accountView = (a) => ({ id: a.id, title: a.title, iban: a.iban, currency: a.currency, balance: a.balance });

/** Данные формы перевода: счета клиента, выбранный вид перевода и счёт списания из ссылки. */
export async function showForm(req, res) {
  const client = await clientModel.findByUserId(req.user.id);
  if (!client) throw new AppError('Клиент не найден', 404);
  const accounts = (await accountService.listForClient(client.id)).map(accountView);
  const kind = req.query.kind === 'own' ? 'own' : 'client';
  res.json({ kind, accounts, fromAccountId: req.query.from ? Number(req.query.from) : null });
}

/**
 * Создание перевода. Ответ говорит клиенту, куда идти дальше:
 * review (на проверке) и executed (выполнен) ведут на страницу счёта, иначе на экран подтверждения кодом.
 */
export async function submit(req, res) {
  const kind = req.body.kind === 'own' ? 'own' : 'client';
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,50' });
  const result = await transferService.createTransfer(req.user.id, {
    kind, amount, comment: req.body.comment,
    fromAccountId: Number(req.body.fromAccountId), toAccountId: Number(req.body.toAccountId), toIban: req.body.toIban
  });
  const base = { id: result.intent.id, fromAccountId: result.intent.from_account_id, review: Boolean(result.review), executed: Boolean(result.executed) };
  if (result.review || result.executed) return res.status(201).json({ ...base, sentTo: null, demoCode: null });
  // код уходит письмом на почту клиента; без настроенной почты в учебной версии он показывается на экране
  const { sentTo, demoCode } = await deliverCode(req, { intentId: result.intent.id, code: result.otpCode, label: 'подтверждения перевода' });
  res.status(201).json({ ...base, sentTo, demoCode });
}

async function loadIntent(req) {
  const intent = await transferModel.findIntent(req.params.id, req.user.id);
  if (!intent) throw new AppError('Перевод не найден', 404);
  const from = await accountModel.findById(intent.from_account_id);
  const to = await accountModel.findById(intent.to_account_id);
  return { intent, from, to };
}

/** Данные экрана подтверждения. Если перевод уже обработан, клиент уходит на страницу счёта (status != new). */
export async function showConfirm(req, res) {
  const { intent, from, to } = await loadIntent(req);
  res.json({
    intent: { id: intent.id, status: intent.status, amount: intent.amount, fee: intent.fee, comment: intent.comment, fromAccountId: intent.from_account_id },
    from: { id: from.id, iban: from.iban, currency: from.currency },
    to: { id: to.id, iban: to.iban, currency: to.currency },
    demoCode: demoCodeFor(req, intent.id)
  });
}

export async function confirm(req, res) {
  const { intent } = await loadIntent(req);
  await transferService.confirmTransfer(req.user.id, intent.id, req.body.code);
  clearDemoCode(req, intent.id);
  res.json({ status: 'ok', fromAccountId: intent.from_account_id, message: 'Перевод выполнен' });
}

export async function cancel(req, res) {
  await transferService.cancelTransfer(req.user.id, req.params.id);
  clearDemoCode(req, req.params.id);
  res.json({ status: 'ok', message: 'Перевод отменён' });
}
