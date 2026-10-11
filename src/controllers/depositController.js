import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import { daysBetween } from '../lib/dates.js';
import { pool } from '../db/pool.js';
import * as clientModel from '../models/clientModel.js';
import * as depositModel from '../models/depositModel.js';
import * as accountService from '../services/accountService.js';
import * as depositService from '../services/depositService.js';
import * as eodService from '../services/eodService.js';

async function clientOf(req) {
  if (req.user?.role_code !== 'client') throw new ForbiddenError();
  return clientModel.findByUserId(req.user.id);
}

export async function index(req, res) {
  const products = await depositModel.listProducts();
  const mine = req.user?.role_code === 'client' ? await depositService.listForClient(req.user.id) : [];
  res.render('pages/deposits/index', { title: 'Вклады', products, mine });
}

async function renderNew(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  const client = await clientOf(req);
  const product = await depositModel.findProduct(Number(form.productId ?? req.query.product));
  if (!product) throw new AppError('Вклад не найден', 404);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === product.currency && ['current', 'savings'].includes(a.kind));
  const products = (await depositModel.listProducts()).filter((p) => p.currency === product.currency);
  res.status(status).render('pages/deposits/new', { title: `Открыть вклад «${product.name}»`, product, products, accounts, form, errors });
}

export const showNew = (req, res) => renderNew(req, res);

/** JSON для калькулятора на странице открытия вклада. */
export async function calc(req, res) {
  const product = await depositModel.findProduct(Number(req.query.product));
  const amount = parseAmount(req.query.amount);
  if (!product || amount === null) return res.json({ ok: false });
  const today = await eodService.currentBankDate(pool);
  const r = depositService.projectIncome({ amount, ratePercent: Number(product.rate_percent), termMonths: product.term_months, capitalization: product.capitalization, openedDate: today });
  res.json({ ok: true, income: r.total, total: r.maturityAmount, currency: product.currency });
}

export async function create(req, res) {
  const amount = parseAmount(req.body.amount);
  try {
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 1000,00' });
    const deposit = await depositService.openDeposit(req.user.id, {
      productId: Number(req.body.productId), sourceAccountId: Number(req.body.sourceAccountId), amount
    });
    req.flash('success', 'Вклад открыт');
    res.redirect(`/deposits/${deposit.id}`);
  } catch (error) {
    if (error instanceof ValidationError) return renderNew(req, res, { form: req.body, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) return renderNew(req, res, { form: req.body, errors: { common: error.message }, status: error.status });
    throw error;
  }
}

export async function show(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  const deposit = await depositService.getForClient(req.user.id, Number(req.params.id));
  const today = String(await eodService.currentBankDate(pool)).slice(0, 10);
  const total = daysBetween(String(deposit.opened_date).slice(0, 10), String(deposit.maturity_date).slice(0, 10));
  const passed = deposit.status === 'active' ? daysBetween(String(deposit.opened_date).slice(0, 10), today) : total;
  const progress = Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
  res.render('pages/deposits/show', { title: `Вклад «${deposit.product_name}»`, deposit, progress, daysLeft: Math.max(0, total - passed) });
}

export async function showClose(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  const quote = await depositService.earlyCloseQuote(req.user.id, Number(req.params.id));
  res.render('pages/deposits/close', { title: 'Досрочное закрытие вклада', quote, error: null });
}

export async function close(req, res) {
  try {
    const result = await depositService.closeEarly(req.user.id, Number(req.params.id));
    req.flash('success', 'Вклад закрыт, деньги возвращены на текущий счёт');
    res.redirect('/accounts');
    return result;
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      const quote = await depositService.earlyCloseQuote(req.user.id, Number(req.params.id)).catch(() => null);
      if (!quote) throw error;
      return res.status(error.status).render('pages/deposits/close', { title: 'Досрочное закрытие вклада', quote, error: error.message });
    }
    throw error;
  }
}
