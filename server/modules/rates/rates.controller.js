import { parseAmount } from '../../shared/money.js';
import * as ratesService from './rates.service.js';
import { ratesView } from '../dashboard/home.controller.js';

const CURRENCIES = ['BYN', 'USD', 'EUR', 'RUB', 'CNY'];

export async function index(req, res) {
  res.json({ rates: await ratesView() });
}

/** Расчёт для конвертера на странице курсов. */
export async function convert(req, res) {
  const { from, to } = req.query;
  const amount = parseAmount(req.query.amount);
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to) || amount === null) return res.json({ ok: false });
  res.json({ ok: true, result: await ratesService.convert({ from, to, amount }) });
}
