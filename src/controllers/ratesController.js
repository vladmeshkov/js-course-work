import { parseAmount } from '../lib/money.js';
import * as ratesService from '../services/ratesService.js';
import { ratesView } from './homeController.js';

const CURRENCIES = ['BYN', 'USD', 'EUR', 'RUB', 'CNY'];

export async function index(req, res) {
  res.render('pages/rates', { title: 'Курсы валют', rates: await ratesView() });
}

/** JSON для конвертера на странице курсов. */
export async function convert(req, res) {
  const { from, to } = req.query;
  const amount = parseAmount(req.query.amount);
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to) || amount === null) return res.json({ ok: false });
  res.json({ ok: true, result: await ratesService.convert({ from, to, amount }) });
}
