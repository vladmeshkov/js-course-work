import { NotFoundError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from '../services/accountService.js';
import * as paymentService from '../services/paymentService.js';

/** Числовой идентификатор из адреса; иначе 404. */
function idOf(value, message = 'Страница или запись не найдена') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new NotFoundError(message);
  return id;
}

/** Платежи и переводы: шаблоны, автоплатежи, последние платежи. */
export async function hub(req, res) {
  res.json(await paymentService.overview(req.user.id));
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

/** Каталог: категории, результаты поиска (если задан q), популярное, шаблоны и автоплатежи. */
export async function catalog(req, res) {
  const q = String(req.query.q ?? '').trim();
  const city = String(req.query.city ?? '');
  const categories = (await paymentService.catalog.categories()).map((c) => ({ ...c, icon: iconFor(c.name) }));
  const found = q ? (await paymentService.catalog.providers({ q, city })).map((p) => ({ ...p, icon: iconFor(p.category_name) })) : [];
  const all = await paymentService.catalog.providers({});
  const POPULAR = ['Энергосбыт', 'Мобильный оператор «Синий»', 'Интернет-провайдер «Сеть»', 'Налоговая инспекция'];
  const popular = POPULAR.map((name) => all.find((p) => p.name === name)).filter(Boolean);
  const { templates, autopayments } = await paymentService.overview(req.user.id);
  res.json({ categories, found, q, city, popular, templates, autopayments });
}

export async function category(req, res) {
  const category = await paymentService.catalog.category(idOf(req.params.id));
  if (!category) throw new NotFoundError();
  const city = String(req.query.city ?? '');
  res.json({
    category: { ...category, icon: iconFor(category.name) }, city, cities: await paymentService.catalog.cities(),
    providers: await paymentService.catalog.providers({ categoryId: category.id, city })
  });
}

/** Данные формы оплаты: получатель, счета в BYN, прошлые платежи и (если открыт шаблон) предзаполненные значения. */
export async function showPay(req, res) {
  const provider = await paymentService.catalog.provider(idOf(req.params.providerId));
  if (!provider) throw new NotFoundError();
  let form = {};
  if (req.query.template) {
    const t = await paymentService.getTemplate(req.user.id, idOf(req.query.template, 'Шаблон не найден'));
    form = { requisite: t.requisite, fromAccountId: t.from_account_id, amount: t.amount ? String(t.amount / 100).replace('.', ',') : '' };
  }
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind));
  res.json({
    provider, icon: iconFor(provider.category_name), form,
    accounts: accounts.map((a) => ({ id: a.id, title: a.title, iban: a.iban, currency: a.currency, balance: a.balance })),
    history: await paymentService.historyFor(req.user.id, provider.id)
  });
}

/** Оплата услуги. В ответе идентификатор платежа: по нему клиент открывает квитанцию. */
export async function pay(req, res) {
  const b = req.body;
  const amount = parseAmount(b.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 25,40' });
  const payment = await paymentService.pay(req.user.id, {
    providerId: Number(b.providerId), fromAccountId: Number(b.fromAccountId), amount, requisite: b.requisite,
    templateName: b.saveTemplate === 'on' ? b.templateName || 'Мой платёж' : '', saveAmount: b.saveAmount === 'on'
  });
  res.status(201).json({ id: payment.id });
}

export async function receipt(req, res) {
  const r = await paymentService.getReceipt(req.user.id, idOf(req.params.id, 'Платёж не найден'));
  res.json({ r });
}

export async function deleteTemplate(req, res) {
  await paymentService.removeTemplate(req.user.id, idOf(req.params.id, 'Шаблон не найден'));
  res.json({ status: 'ok', message: 'Шаблон удалён' });
}

export async function createAutopay(req, res) {
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму' });
  await paymentService.createAutopayment(req.user.id, { templateId: idOf(req.params.id, 'Шаблон не найден'), amount, day: Number(req.body.day) });
  res.status(201).json({ status: 'ok', message: 'Автоплатёж включён' });
}

export async function cancelAutopay(req, res) {
  await paymentService.cancelAutopayment(req.user.id, idOf(req.params.id, 'Автоплатёж не найден'));
  res.json({ status: 'ok', message: 'Автоплатёж отключён' });
}
