import { parseAmount } from '../lib/money.js';
import * as ratesService from '../services/ratesService.js';
import * as settingsService from '../services/settingsService.js';

const CURRENCIES = ['BYN', 'USD', 'EUR', 'RUB'];

export async function index(req, res) {
  const spreads = await settingsService.spreads();
  res.render('pages/rates', { title: 'Курсы валют', spreads, currencies: CURRENCIES });
}

/** JSON для конвертера на странице курсов. */
export async function convert(req, res) {
  const { from, to } = req.query;
  const amount = parseAmount(req.query.amount);
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to) || amount === null) return res.json({ ok: false });
  res.json({ ok: true, result: await ratesService.convert({ from, to, amount }) });
}
