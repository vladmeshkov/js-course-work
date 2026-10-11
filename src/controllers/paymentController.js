import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from '../services/accountService.js';
import * as paymentService from '../services/paymentService.js';

function requireClient(req) {
  if (req.user?.role_code !== 'client') throw new ForbiddenError();
}

export async function hub(req, res) {
  requireClient(req);
  res.render('pages/payments/hub', { title: 'Платежи и переводы', ...(await paymentService.overview(req.user.id)), errors: {}, form: {} });
}

/** Трёхмерная иконка категории по её названию. */
function iconFor(name) {
  const n = String(name).toLowerCase();
  if (n.includes('жиль') || n.includes('коммун')) return 'house';
  if (n.includes('налог') || n.includes('штраф')) return 'tax';
  if (n.includes('образ')) return 'edu';
  if (n.includes('транспорт')) return 'bus';
  if (n.includes('благотвор')) return 'heart';
  return 'phone';
}

export async function catalog(req, res) {
  requireClient(req);
  const q = String(req.query.q ?? '').trim();
  const city = String(req.query.city ?? '');
  const categories = (await paymentService.catalog.categories()).map((c) => ({ ...c, icon: iconFor(c.name) }));
  const found = q ? await paymentService.catalog.providers({ q, city }) : [];
  res.render('pages/payments/catalog', { title: 'Каталог платежей', categories, found, q, city, cities: await paymentService.catalog.cities() });
}

export async function category(req, res) {
  requireClient(req);
  const category = await paymentService.catalog.category(Number(req.params.id));
  if (!category) throw new NotFoundError();
  const city = String(req.query.city ?? '');
  res.render('pages/payments/category', {
    title: category.name, category: { ...category, icon: iconFor(category.name) }, city, cities: await paymentService.catalog.cities(),
    providers: await paymentService.catalog.providers({ categoryId: category.id, city })
  });
}

async function renderPay(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  requireClient(req);
  const provider = await paymentService.catalog.provider(Number(req.params.providerId ?? form.providerId));
  if (!provider) throw new NotFoundError();
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind));
  res.status(status).render('pages/payments/pay', { title: provider.name, provider, accounts, form, errors });
}

export async function showPay(req, res) {
  requireClient(req);
  let form = {};
  if (req.query.template) {
    const t = await paymentService.getTemplate(req.user.id, Number(req.query.template));
    form = { requisite: t.requisite, fromAccountId: t.from_account_id, amount: t.amount ? String(t.amount / 100).replace('.', ',') : '' };
  }
  return renderPay(req, res, { form });
}

export async function pay(req, res) {
  requireClient(req);
  const b = req.body;
  req.params.providerId = b.providerId;
  try {
    const amount = parseAmount(b.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 25,40' });
    const payment = await paymentService.pay(req.user.id, {
      providerId: Number(b.providerId), fromAccountId: Number(b.fromAccountId), amount, requisite: b.requisite,
      templateName: b.saveTemplate === 'on' ? b.templateName || 'Мой платёж' : '', saveAmount: b.saveAmount === 'on'
    });
    res.redirect(`/payments/${payment.id}/receipt`);
  } catch (error) {
    if (error instanceof ValidationError) return renderPay(req, res, { form: b, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) return renderPay(req, res, { form: b, errors: { common: error.message }, status: error.status });
    throw error;
  }
}

export async function receipt(req, res) {
  requireClient(req);
  const r = await paymentService.getReceipt(req.user.id, Number(req.params.id));
  res.render('pages/payments/receipt', { title: `Квитанция № ${r.id}`, r });
}

export async function deleteTemplate(req, res) {
  requireClient(req);
  await paymentService.removeTemplate(req.user.id, Number(req.params.id));
  req.flash('info', 'Шаблон удалён');
  res.redirect('/payments');
}

export async function createAutopay(req, res) {
  requireClient(req);
  try {
    const amount = parseAmount(req.body.amount);
    if (amount === null) throw new ValidationError({ amount: 'Введите сумму' });
    await paymentService.createAutopayment(req.user.id, { templateId: Number(req.params.id), amount, day: Number(req.body.day) });
    req.flash('success', 'Автоплатёж включён');
    res.redirect('/payments');
  } catch (error) {
    if (error instanceof ValidationError) {
      req.flash('error', Object.values(error.fields).join('. '));
      return res.redirect('/payments');
    }
    throw error;
  }
}

export async function cancelAutopay(req, res) {
  requireClient(req);
  await paymentService.cancelAutopayment(req.user.id, Number(req.params.id));
  req.flash('info', 'Автоплатёж отключён');
  res.redirect('/payments');
}
