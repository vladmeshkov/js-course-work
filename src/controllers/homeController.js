import * as loanModel from '../models/loanModel.js';
import * as depositModel from '../models/depositModel.js';
import * as settingsService from '../services/settingsService.js';

const NAMES = {
  USD: { symbol: '$', name: 'Доллар США', code: 'usd' },
  EUR: { symbol: '€', name: 'Евро', code: 'eur' },
  RUB: { symbol: '₽', name: 'Российский рубль', code: 'rub' },
  CNY: { symbol: '¥', name: 'Китайский юань', code: 'cny' }
};

/** Курсы банка для блока «Конвертер и курсы»: курс Нацбанка, скорректированный на спред. */
export async function ratesView() {
  const rows = (await settingsService.spreads()).filter((r) => r.rate !== null && NAMES[r.currency]);
  const order = Object.keys(NAMES);
  rows.sort((a, b) => order.indexOf(a.currency) - order.indexOf(b.currency));
  return rows.map((r) => {
    const perScale = r.rate; // BYN за scale единиц
    return {
      currency: r.currency, scale: r.scale, ...NAMES[r.currency],
      buy: (perScale * (1 - r.buy_percent / 100)).toFixed(4).replace('.', ','),
      sell: (perScale * (1 + r.sell_percent / 100)).toFixed(4).replace('.', ','),
      date: String(r.rate_date).slice(0, 10)
    };
  });
}

export async function home(req, res) {
  if (req.user) return res.redirect(req.user.role_code === 'client' ? '/cabinet' : '/workplace');
  const deposits = await depositModel.listProducts();
  const loans = await loanModel.listProducts();
  res.render('pages/home', {
    title: 'ТалерБанк',
    maxDepositRate: Math.max(...deposits.map((d) => Number(d.rate_percent))),
    minLoanRate: Math.min(...loans.map((l) => Number(l.rate_percent))),
    rates: await ratesView()
  });
}
