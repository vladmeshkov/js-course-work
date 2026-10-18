import { ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as accountService from '../services/accountService.js';
import * as cashService from '../services/cashService.js';
import * as kycService from '../services/kycService.js';
import * as interbankService from '../services/interbankService.js';

/** Очередь анкет на проверку. */
export async function kycQueue(req, res) {
  res.json({ clients: await kycService.queue() });
}

/** Анкета для проверки: паспорт и идентификационный номер расшифрованы, факт просмотра записан в журнал. */
export async function kycShow(req, res) {
  const c = await kycService.getForReview(Number(req.params.id), req.user.id);
  res.json({
    client: {
      id: c.id, login: c.login, lastName: c.last_name, firstName: c.first_name, patronymic: c.patronymic,
      birthDate: c.birth_date, phone: c.phone, email: c.email, idNumber: c.idNumber, passport: c.passport,
      kycStatus: c.kyc_status
    }
  });
}

/** Решение по анкете: decision = approve (клиент подтверждён, открыт счёт в BYN) или reject (нужен комментарий). */
export async function kycDecide(req, res) {
  const id = Number(req.params.id);
  if (req.body.decision === 'approve') {
    await kycService.verifyClient(id, req.user.id);
    return res.json({ status: 'ok', decision: 'approve', message: 'Клиент подтверждён, счёт в BYN открыт' });
  }
  const comment = String(req.body.comment ?? '').trim();
  if (!comment) throw new ValidationError({ comment: 'Укажите причину отказа' });
  await kycService.rejectClient(id, req.user.id, comment);
  res.json({ status: 'ok', decision: 'reject', message: 'Заявка отклонена' });
}

/** Кассовая операция: direction = in (взнос) или out (выдача), amount текстом («150,00»). */
export async function cash(req, res) {
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
  const { documentId, account } = await cashService.cashOperation(req.user.id, { iban: req.body.iban, amount, direction: req.body.direction });
  res.json({
    status: 'ok', documentId, direction: req.body.direction, amount, currency: account.currency,
    message: req.body.direction === 'in' ? 'Наличные внесены на счёт' : 'Наличные выданы'
  });
}

/** Поиск счетов клиентов по логину или части номера (пустой запрос даёт пустой список). */
export async function accounts(req, res) {
  const q = String(req.query.q ?? '').trim();
  res.json({ q, accounts: q ? await accountService.searchAccounts(q) : [] });
}

/** Блокировка (action = freeze, нужно основание reason) и разблокировка (action = unfreeze) счёта. */
export async function freeze(req, res) {
  const frozen = req.body.action === 'freeze';
  await accountService.setFrozen(req.user.id, Number(req.params.id), frozen, req.body.reason);
  res.json({ status: 'ok', frozen, message: frozen ? 'Счёт заблокирован' : 'Счёт разблокирован' });
}

/** Справочник банков для формы регистрации входящего платежа. */
export async function incomingForm(req, res) {
  res.json({ banks: await interbankService.banks() });
}

/** Регистрация входящего платежа из другого банка. */
export async function incoming(req, res) {
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
  const { id } = await interbankService.registerIncoming(req.user.id, {
    iban: req.body.iban, bankCode: req.body.bankCode, name: req.body.name, amount, purpose: req.body.purpose
  });
  res.status(201).json({ status: 'ok', id, message: 'Платёж зачислен на счёт клиента' });
}
