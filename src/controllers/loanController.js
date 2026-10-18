import { config } from '../config/index.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as clientModel from '../models/clientModel.js';
import * as loanModel from '../models/loanModel.js';
import * as accountService from '../services/accountService.js';
import * as mailService from '../services/mailService.js';
import * as loanService from '../services/loanService.js';

/** Учебный код подписания, если он был выдан для этой заявки (без почты и не в промышленном режиме). */
function demoCodeFor(req, applicationId) {
  return req.session.demoOtp?.loanId === applicationId ? req.session.demoOtp.code : null;
}

/**
 * Каталог кредитов: открыт гостю. У вошедшего клиента к каталогу добавляются его кредиты и заявки.
 * @returns {{products: object[], loans: object[], applications: object[]}}
 */
export async function index(req, res) {
  const products = await loanModel.listProducts();
  const mine = req.user?.role_code === 'client' ? await loanService.listForClient(req.user.id) : { loans: [], applications: [] };
  res.json({ products, ...mine });
}

/** Данные страницы заявки: выбранный кредит и счета в BYN для зачисления. */
export async function showNew(req, res) {
  const client = await clientModel.findByUserId(req.user.id);
  const product = await loanModel.findProduct(Number(req.query.product));
  if (!product) throw new AppError('Кредит не найден', 404);
  const accounts = (await accountService.listForClient(client.id))
    .filter((a) => a.currency === 'BYN' && ['current', 'savings'].includes(a.kind))
    .map((a) => ({ id: a.id, title: a.title, iban: a.iban, balance: a.balance, currency: a.currency }));
  res.json({ product, accounts });
}

/** Расчёт графика по введённым условиям для калькулятора. Открыт без входа. */
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

/** Подача заявки. Скоринг выполняется сразу, в ответе номер заявки и её статус. */
export async function create(req, res) {
  const b = req.body;
  const income = parseAmount(b.income);
  const obligations = b.obligations === '' || b.obligations === undefined ? 0 : parseAmount(b.obligations);
  const amount = parseAmount(b.amount);
  const errors = {};
  if (income === null) errors.income = 'Введите доход, например 1500,00';
  if (obligations === null) errors.obligations = 'Введите сумму или 0';
  if (amount === null) errors.amount = 'Введите сумму, например 5000,00';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const application = await loanService.apply(req.user.id, {
    productId: Number(b.productId), amount, termMonths: Number(b.termMonths), scheduleType: b.scheduleType,
    targetAccountId: Number(b.targetAccountId), income, obligations,
    experienceMonths: Number(b.experienceMonths), dependents: Number(b.dependents || 0)
  });
  res.status(201).json({ id: application.id, status: application.status });
}

/** Заявка клиента со скоринговыми пояснениями; demoCode есть, только если код выдан в учебном режиме. */
export async function showApplication(req, res) {
  const application = await loanService.applicationForClient(req.user.id, Number(req.params.id));
  res.json({ application, demoCode: demoCodeFor(req, application.id) });
}

/** Выдаёт код подписания договора: письмом на почту, а без почты (не в промышленном режиме) возвращает его в ответе. */
export async function sendCode(req, res) {
  const id = Number(req.params.id);
  const code = await loanService.requestSignCode(req.user.id, id);
  const sentTo = await mailService.sendCode(req.user.id, code, 'подписания кредитного договора');
  let demoCode = null;
  if (!sentTo && !config.isProd) {
    req.session.demoOtp = { loanId: id, code };
    demoCode = code;
  }
  res.json({ sentTo: sentTo || null, demoCode });
}

/** Подписание договора кодом: деньги зачисляются на счёт. Возвращает номер кредита. */
export async function sign(req, res) {
  const loan = await loanService.sign(req.user.id, Number(req.params.id), req.body.code);
  delete req.session.demoOtp;
  res.json({ id: loan.id });
}

/** Кредит с графиком, ближайшим платежом, просрочкой и расчётом полного погашения. */
export async function show(req, res) {
  res.json(await loanService.getLoan(req.user.id, Number(req.params.id)));
}

/** Полное досрочное погашение: возвращает расчёт (долг, проценты, пеня, итог). */
export async function repayFull(req, res) {
  res.json(await loanService.repayFull(req.user.id, Number(req.params.id)));
}

/** Частичное досрочное погашение: mode «term» сокращает срок, «payment» снижает платёж. */
export async function repayPartial(req, res) {
  const amount = parseAmount(req.body.amount);
  if (amount === null) throw new ValidationError({ amount: 'Введите сумму, например 500,00' });
  res.json(await loanService.repayPartial(req.user.id, Number(req.params.id), { amount, mode: req.body.mode }));
}
