import { config } from '../config/index.js';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as transferModel from '../models/transferModel.js';
import * as accountService from '../services/accountService.js';
import * as mailService from '../services/mailService.js';
import * as transferService from '../services/transferService.js';

async function clientAccounts(req) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  const client = await clientModel.findByUserId(req.user.id);
  if (!client) throw new ForbiddenError();
  return accountService.listForClient(client.id);
}

async function renderForm(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  const accounts = await clientAccounts(req);
  const kind = (form.kind ?? req.query.kind) === 'own' ? 'own' : 'client';
  res.status(status).render('pages/transfers/new', { title: 'Перевод', accounts, kind, form, errors });
}

export function showForm(req, res) {
  return renderForm(req, res, { form: { fromAccountId: req.query.from } });
}

export async function submit(req, res) {
  const kind = req.body.kind === 'own' ? 'own' : 'client';
  const amount = parseAmount(req.body.amount);
  try {
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,50' });
    const result = await transferService.createTransfer(req.user.id, {
      kind, amount, comment: req.body.comment,
      fromAccountId: Number(req.body.fromAccountId), toAccountId: Number(req.body.toAccountId), toIban: req.body.toIban
    });
    if (result.review) {
      req.flash('info', 'Перевод принят и находится на проверке в банке. Мы сообщим о результате, деньги на счёте зарезервированы.');
      return res.redirect(`/accounts/${result.intent.from_account_id}`);
    }
    if (result.executed) {
      req.flash('success', 'Перевод выполнен');
      return res.redirect(`/accounts/${result.intent.from_account_id}`);
    }
    // код уходит письмом на почту клиента; без настроенной почты в учебной версии он показывается на экране
    const sentTo = await mailService.sendCode(req.user.id, result.otpCode, 'подтверждения перевода');
    if (sentTo) req.flash('info', `Код подтверждения отправлен на почту ${sentTo}`);
    else if (!config.isProd) req.session.demoOtp = { intentId: result.intent.id, code: result.otpCode };
    return res.redirect(`/transfers/${result.intent.id}/confirm`);
  } catch (error) {
    if (error instanceof ValidationError) return renderForm(req, res, { form: req.body, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) {
      return renderForm(req, res, { form: req.body, errors: { common: error.message }, status: error.status });
    }
    throw error;
  }
}

async function loadIntent(req) {
  const intent = await transferModel.findIntent(req.params.id, req.user.id);
  if (!intent) throw new AppError('Перевод не найден', 404);
  const from = await accountModel.findById(intent.from_account_id);
  const to = await accountModel.findById(intent.to_account_id);
  return { intent, from, to };
}

export async function showConfirm(req, res) {
  const { intent, from, to } = await loadIntent(req);
  if (intent.status !== 'new') return res.redirect(`/accounts/${intent.from_account_id}`);
  const demo = req.session.demoOtp?.intentId === intent.id ? req.session.demoOtp.code : null;
  res.render('pages/transfers/confirm', { title: 'Подтверждение перевода', intent, from, to, demoCode: demo, error: null });
}

export async function confirm(req, res) {
  const { intent, from, to } = await loadIntent(req);
  try {
    await transferService.confirmTransfer(req.user.id, intent.id, req.body.code);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      const demo = req.session.demoOtp?.intentId === intent.id ? req.session.demoOtp.code : null;
      return res.status(error.status).render('pages/transfers/confirm', { title: 'Подтверждение перевода', intent, from, to, demoCode: demo, error: error.message });
    }
    throw error;
  }
  delete req.session.demoOtp;
  req.flash('success', 'Перевод выполнен');
  res.redirect(`/accounts/${intent.from_account_id}`);
}

export async function cancel(req, res) {
  await transferService.cancelTransfer(req.user.id, req.params.id);
  delete req.session.demoOtp;
  req.flash('info', 'Перевод отменён');
  res.redirect('/transfers/new');
}
