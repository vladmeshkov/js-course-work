import { config } from '../config/index.js';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as accountService from '../services/accountService.js';
import * as clientModel from '../models/clientModel.js';
import * as mailService from '../services/mailService.js';
import * as interbankService from '../services/interbankService.js';

function requireClient(req) {
  if (req.user?.role_code !== 'client') throw new ForbiddenError();
}

async function renderForm(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  requireClient(req);
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind));
  res.status(status).render('pages/transfers/interbank', {
    title: 'Перевод в другой банк', accounts, form, errors,
    banks: await interbankService.banks(), history: await interbankService.listForUser(req.user.id)
  });
}

export const showForm = (req, res) => renderForm(req, res);

export async function create(req, res) {
  requireClient(req);
  const b = req.body;
  try {
    const amount = parseAmount(b.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 150,00' });
    const r = await interbankService.createTransfer(req.user.id, { fromAccountId: Number(b.fromAccountId), iban: b.iban, name: b.name, amount, purpose: b.purpose });
    const sentTo = await mailService.sendCode(req.user.id, r.otpCode, 'подтверждения перевода в другой банк');
    if (sentTo) req.flash('info', `Код подтверждения отправлен на почту ${sentTo}`);
    else if (!config.isProd) req.session.demoOtp = { intentId: String(r.transfer.id), code: r.otpCode };
    res.redirect(`/transfers/interbank/${r.transfer.id}/confirm`);
  } catch (error) {
    if (error instanceof ValidationError) return renderForm(req, res, { form: b, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) return renderForm(req, res, { form: b, errors: { common: error.message }, status: error.status });
    throw error;
  }
}

async function renderConfirm(req, res, error = null, status = 200) {
  requireClient(req);
  const transfer = await interbankService.findForUser(req.user.id, Number(req.params.id));
  if (!transfer) throw new AppError('Перевод не найден', 404);
  if (transfer.status !== 'pending_otp') return res.redirect('/transfers/interbank');
  const demo = req.session.demoOtp?.intentId === String(transfer.id) ? req.session.demoOtp.code : null;
  res.status(status).render('pages/transfers/interbank-confirm', { title: 'Подтверждение перевода', transfer, demoCode: demo, error });
}

export const showConfirm = (req, res) => renderConfirm(req, res);

export async function confirm(req, res) {
  requireClient(req);
  try {
    await interbankService.confirm(req.user.id, Number(req.params.id), req.body.code);
    delete req.session.demoOtp;
    req.flash('success', 'Перевод принят. Он будет отправлен в банк получателя при закрытии операционного дня.');
    res.redirect('/transfers/interbank');
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return renderConfirm(req, res, error.message, error.status);
    throw error;
  }
}

export async function cancel(req, res) {
  requireClient(req);
  await interbankService.cancel(req.user.id, Number(req.params.id));
  req.flash('info', 'Перевод отменён, деньги разблокированы');
  res.redirect('/transfers/interbank');
}
