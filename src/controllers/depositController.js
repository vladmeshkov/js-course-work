import { AppError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import { daysBetween } from '../lib/dates.js';
import { pool } from '../db/pool.js';
import * as clientModel from '../models/clientModel.js';
import * as depositModel from '../models/depositModel.js';
import * as accountService from '../services/accountService.js';
import * as depositService from '../services/depositService.js';
import * as eodService from '../services/eodService.js';

/**
 * Каталог вкладов: открыт гостю. У вошедшего клиента к каталогу добавляется список его вкладов.
 * @returns {{products: object[], mine: object[]}}
 */
export async function index(req, res) {
  const products = await depositModel.listProducts();
  const mine = req.user?.role_code === 'client' ? await depositService.listForClient(req.user.id) : [];
  res.json({ products, mine });
}

/** Данные страницы открытия вклада: выбранный вклад, вклады той же валюты и подходящие счета списания. */
export async function showNew(req, res) {
  const client = await clientModel.findByUserId(req.user.id);
  const product = await depositModel.findProduct(Number(req.query.product));
  if (!product) throw new AppError('Вклад не найден', 404);
  const accounts = (await accountService.listForClient(client.id))
    .filter((a) => a.currency === product.currency && ['current', 'savings'].includes(a.kind))
    .map((a) => ({ id: a.id, title: a.title, iban: a.iban, balance: a.balance, currency: a.currency }));
  const products = (await depositModel.listProducts()).filter((p) => p.currency === product.currency);
  res.json({ product, products, accounts });
}

/** Расчёт дохода для калькулятора на странице открытия вклада. Открыт без входа. */
export async function calc(req, res) {
  const product = await depositModel.findProduct(Number(req.query.product));
  const amount = parseAmount(req.query.amount);
  if (!product || amount === null) return res.json({ ok: false });
  const today = await eodService.currentBankDate(pool);
  const r = depositService.projectIncome({ amount, ratePercent: Number(product.rate_percent), termMonths: product.term_months, capitalization: product.capitalization, openedDate: today });
  res.json({ ok: true, income: r.total, total: r.maturityAmount, currency: product.currency });
}

/** Открытие вклада. Возвращает номер вклада, по нему страница переходит к его карточке. */
export async function create(req, res) {
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 1000,00' });
  const deposit = await depositService.openDeposit(req.user.id, {
    productId: Number(req.body.productId), sourceAccountId: Number(req.body.sourceAccountId), amount
  });
  res.status(201).json({ id: deposit.id });
}

/** Карточка вклада: данные, доля прошедшего срока и остаток дней. */
export async function show(req, res) {
  const deposit = await depositService.getForClient(req.user.id, Number(req.params.id));
  const today = String(await eodService.currentBankDate(pool)).slice(0, 10);
  const total = daysBetween(String(deposit.opened_date).slice(0, 10), String(deposit.maturity_date).slice(0, 10));
  const passed = deposit.status === 'active' ? daysBetween(String(deposit.opened_date).slice(0, 10), today) : total;
  const progress = Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
  res.json({ deposit, progress, daysLeft: Math.max(0, total - passed) });
}

/** Расчёт досрочного закрытия: что получит клиент. */
export async function showClose(req, res) {
  res.json({ quote: await depositService.earlyCloseQuote(req.user.id, Number(req.params.id)) });
}

/** Досрочное закрытие вклада. Возвращает расчёт с суммой, зачисленной на текущий счёт. */
export async function close(req, res) {
  res.json(await depositService.closeEarly(req.user.id, Number(req.params.id)));
}
