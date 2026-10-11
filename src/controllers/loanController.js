import { config } from '../config/index.js';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as clientModel from '../models/clientModel.js';
import * as loanModel from '../models/loanModel.js';
import * as accountService from '../services/accountService.js';
import * as loanService from '../services/loanService.js';

function requireClient(req) {
  if (req.user?.role_code !== 'client') throw new ForbiddenError();
}

export async function index(req, res) {
  const products = await loanModel.listProducts();
  const mine = req.user?.role_code === 'client' ? await loanService.listForClient(req.user.id) : { loans: [], applications: [] };
  res.render('pages/loans/index', { title: 'Кредиты', products, ...mine });
}

async function renderNew(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  requireClient(req);
  const client = await clientModel.findByUserId(req.user.id);
  const product = await loanModel.findProduct(Number(form.productId ?? req.query.product));
  if (!product) throw new AppError('Кредит не найден', 404);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind));
  res.status(status).render('pages/loans/new', { title: `Кредит «${product.name}»`, product, accounts, form, errors });
}

export const showNew = (req, res) => renderNew(req, res);

/** JSON для калькулятора: график по введённым условиям. */
export async function calc(req, res) {
  try {
    const { rows } = await loanService.previewSchedule({
      productId: Number(req.query.product), amount: parseAmount(req.query.amount), termMonths: Number(req.query.term), type: req.query.type
    });
    const total = rows.reduce((t, r) => t + r.total, 0);
    const principal = rows.reduce((t, r) => t + r.principal, 0);
    res.json({ ok: true, rows, total, overpay: total - principal });
  } catch (error) {
    if (error instanceof AppError) return res.json({ ok: false, errors: error.fields ?? { common: error.message } });
    throw error;
  }
}

export async function create(req, res) {
  const b = req.body;
  try {
    const income = parseAmount(b.income);
    const obligations = b.obligations === '' || b.obligations === undefined ? 0 : parseAmount(b.obligations);
    const errors = {};
    if (income === null) errors.income = 'Введите доход, например 1500,00';
    if (obligations === null) errors.obligations = 'Введите сумму или 0';
    const amount = parseAmount(b.amount);
    if (amount === null) errors.amount = 'Введите сумму, например 5000,00';
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const application = await loanService.apply(req.user.id, {
      productId: Number(b.productId), amount, termMonths: Number(b.termMonths), scheduleType: b.scheduleType,
      targetAccountId: Number(b.targetAccountId), income, obligations,
      experienceMonths: Number(b.experienceMonths), dependents: Number(b.dependents || 0)
    });
    res.redirect(`/loans/applications/${application.id}`);
  } catch (error) {
    if (error instanceof ValidationError) return renderNew(req, res, { form: b, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) return renderNew(req, res, { form: b, errors: { common: error.message }, status: error.status });
    throw error;
  }
}

export async function showApplication(req, res) {
  requireClient(req);
  const application = await loanService.applicationForClient(req.user.id, Number(req.params.id));
  const demo = req.session.demoOtp?.loanId === application.id ? req.session.demoOtp.code : null;
  res.render('pages/loans/application', { title: `Заявка № ${application.id}`, application, demoCode: demo, error: null });
}

export async function sendCode(req, res) {
  requireClient(req);
  const id = Number(req.params.id);
  const code = await loanService.requestSignCode(req.user.id, id);
  if (!config.isProd) req.session.demoOtp = { loanId: id, code };
  req.flash('info', 'Код отправлен на ваш телефон');
  res.redirect(`/loans/applications/${id}`);
}

export async function sign(req, res) {
  requireClient(req);
  const id = Number(req.params.id);
  try {
    const loan = await loanService.sign(req.user.id, id, req.body.code);
    delete req.session.demoOtp;
    req.flash('success', 'Договор подписан, деньги зачислены на счёт');
    res.redirect(`/loans/${loan.id}`);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      const application = await loanService.applicationForClient(req.user.id, id);
      const demo = req.session.demoOtp?.loanId === id ? req.session.demoOtp.code : null;
      return res.status(error.status).render('pages/loans/application', { title: `Заявка № ${id}`, application, demoCode: demo, error: error.message });
    }
    throw error;
  }
}

export async function show(req, res) {
  requireClient(req);
  const data = await loanService.getLoan(req.user.id, Number(req.params.id));
  res.render('pages/loans/show', { title: `Кредит № ${data.loan.id}`, ...data, errors: {}, form: {} });
}

export async function repayFull(req, res) {
  requireClient(req);
  await loanService.repayFull(req.user.id, Number(req.params.id));
  req.flash('success', 'Кредит полностью погашен');
  res.redirect('/loans');
}

export async function repayPartial(req, res) {
  requireClient(req);
  const id = Number(req.params.id);
  try {
    const amount = parseAmount(req.body.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 500,00' });
    await loanService.repayPartial(req.user.id, id, { amount, mode: req.body.mode });
    req.flash('success', 'Досрочный платёж принят, график пересчитан');
    res.redirect(`/loans/${id}`);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      const data = await loanService.getLoan(req.user.id, id);
      return res.status(error.status).render('pages/loans/show', {
        title: `Кредит № ${id}`, ...data, form: req.body, errors: error.fields ?? { common: error.message }
      });
    }
    throw error;
  }
}
