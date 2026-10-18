import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import { clearDemoCode, deliverCode, demoCodeFor } from '../lib/demoCode.js';
import * as accountService from '../services/accountService.js';
import * as clientModel from '../models/clientModel.js';
import * as interbankService from '../services/interbankService.js';

/** Числовой идентификатор из адреса; иначе 404. */
const idOf = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('Перевод не найден');
  return id;
};

const accountView = (a) => ({ id: a.id, title: a.title, iban: a.iban, currency: a.currency, balance: a.balance });

/** Перевод для списка клиента: без оценки риска, она внутренняя. */
const transferView = (t) => ({
  id: t.id, status: t.status, amount: t.amount, fee: t.fee, counterparty_name: t.counterparty_name, counterparty_iban: t.counterparty_iban,
  bank_name: t.bank_name, reject_reason: t.reject_reason ?? null
});

/** Данные формы: счета в BYN, банки клиринга и история переводов. */
export async function showForm(req, res) {
  const client = await clientModel.findByUserId(req.user.id);
  if (!client) throw new AppError('Клиент не найден', 404);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind));
  res.json({
    accounts: accounts.map(accountView),
    banks: (await interbankService.banks()).map((b) => ({ code: b.code, name: b.name, active: Boolean(b.active) })),
    history: (await interbankService.listForUser(req.user.id)).map(transferView)
  });
}

export async function create(req, res) {
  const b = req.body;
  const amount = parseAmount(b.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
  const r = await interbankService.createTransfer(req.user.id, { fromAccountId: Number(b.fromAccountId), iban: b.iban, name: b.name, amount, purpose: b.purpose });
  const { sentTo, demoCode } = await deliverCode(req, { intentId: r.transfer.id, code: r.otpCode, label: 'подтверждения перевода в другой банк' });
  res.status(201).json({ id: r.transfer.id, sentTo, demoCode });
}

/** Данные экрана подтверждения. Если перевод уже не ждёт кода, клиент уходит к списку переводов (status != pending_otp). */
export async function showConfirm(req, res) {
  const transfer = await interbankService.findForUser(req.user.id, idOf(req));
  if (!transfer) throw new AppError('Перевод не найден', 404);
  res.json({ transfer: transferView(transfer), demoCode: demoCodeFor(req, transfer.id) });
}

export async function confirm(req, res) {
  const id = idOf(req);
  await interbankService.confirm(req.user.id, id, req.body.code);
  clearDemoCode(req, id);
  res.json({ status: 'ok', message: 'Перевод принят. Он будет отправлен в банк получателя при закрытии операционного дня.' });
}

export async function cancel(req, res) {
  const id = idOf(req);
  await interbankService.cancel(req.user.id, id);
  clearDemoCode(req, id);
  res.json({ status: 'ok', message: 'Перевод отменён, деньги разблокированы' });
}
