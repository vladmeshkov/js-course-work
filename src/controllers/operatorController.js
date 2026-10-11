import { AppError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as accountService from '../services/accountService.js';
import * as cashService from '../services/cashService.js';
import * as kycService from '../services/kycService.js';
import * as interbankService from '../services/interbankService.js';

export async function kycQueue(req, res) {
  res.render('pages/staff/kyc', { title: 'Анкеты клиентов', clients: await kycService.queue() });
}

export async function kycShow(req, res) {
  const client = await kycService.getForReview(Number(req.params.id), req.user.id);
  res.render('pages/staff/kyc-review', { title: `Анкета ${client.last_name}`, client, errors: {} });
}

export async function kycDecide(req, res) {
  const id = Number(req.params.id);
  try {
    if (req.body.decision === 'approve') {
      await kycService.verifyClient(id, req.user.id);
      req.flash('success', 'Клиент подтверждён, счёт в BYN открыт');
    } else {
      if (!String(req.body.comment ?? '').trim()) throw new ValidationError({ comment: 'Укажите причину отказа' });
      await kycService.rejectClient(id, req.user.id, req.body.comment.trim());
      req.flash('success', 'Заявка отклонена');
    }
    res.redirect('/staff/kyc');
  } catch (error) {
    if (error instanceof ValidationError) {
      const client = await kycService.getForReview(id, req.user.id);
      return res.status(422).render('pages/staff/kyc-review', { title: `Анкета ${client.last_name}`, client, errors: error.fields });
    }
    throw error;
  }
}

export function showCash(req, res) {
  res.render('pages/staff/cash', { title: 'Касса', form: {}, errors: {} });
}

export async function cash(req, res) {
  try {
    const amount = parseAmount(req.body.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
    const r = await cashService.cashOperation(req.user.id, { iban: req.body.iban, amount, direction: req.body.direction });
    req.flash('success', req.body.direction === 'in' ? 'Наличные внесены на счёт' : 'Наличные выданы');
    res.redirect('/staff/cash');
    return r;
  } catch (error) {
    if (error instanceof ValidationError) return res.status(422).render('pages/staff/cash', { title: 'Касса', form: req.body, errors: error.fields });
    if (error instanceof AppError && error.status < 500) return res.status(error.status).render('pages/staff/cash', { title: 'Касса', form: req.body, errors: { common: error.message } });
    throw error;
  }
}

export async function accounts(req, res) {
  const q = String(req.query.q ?? '').trim();
  res.render('pages/staff/accounts', { title: 'Счета клиентов', q, accounts: q ? await accountService.searchAccounts(q) : [] });
}

export async function freeze(req, res) {
  try {
    await accountService.setFrozen(req.user.id, Number(req.params.id), req.body.action === 'freeze', req.body.reason);
    req.flash('success', req.body.action === 'freeze' ? 'Счёт заблокирован' : 'Счёт разблокирован');
  } catch (error) {
    if (error instanceof AppError && error.status < 500) req.flash('error', error.message);
    else throw error;
  }
  res.redirect(`/staff/accounts?q=${encodeURIComponent(req.body.q ?? '')}`);
}

export async function showIncoming(req, res) {
  res.render('pages/staff/incoming', { title: 'Входящие платежи', banks: await interbankService.banks(), form: {}, errors: {} });
}

export async function incoming(req, res) {
  try {
    const amount = parseAmount(req.body.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
    await interbankService.registerIncoming(req.user.id, { iban: req.body.iban, bankCode: req.body.bankCode, name: req.body.name, amount, purpose: req.body.purpose });
    req.flash('success', 'Платёж зачислен на счёт клиента');
    res.redirect('/staff/incoming');
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).render('pages/staff/incoming', { title: 'Входящие платежи', banks: await interbankService.banks(), form: req.body, errors: error.fields });
    }
    throw error;
  }
}
