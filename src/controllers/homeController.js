import * as loanModel from '../models/loanModel.js';
import * as depositModel from '../models/depositModel.js';
import * as searchService from '../services/searchService.js';
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

const INFO = {
  privacy: {
    title: 'Политика конфиденциальности',
    blocks: [
      ['Какие данные мы храним', 'Анкетные данные клиента, сведения о счетах и операциях. Паспортные данные и идентификационный номер хранятся в зашифрованном виде (AES-256-GCM).'],
      ['Как мы их защищаем', 'Пароли хранятся только в виде хэшей bcrypt. Доступ сотрудников ограничен правами роли, действия фиксируются в неизменяемом журнале аудита.'],
      ['Передача третьим лицам', 'Данные не передаются третьим лицам, кроме случаев, предусмотренных законодательством.']
    ]
  },
  terms: {
    title: 'Условия обслуживания',
    blocks: [
      ['Предмет', 'Банк предоставляет клиенту дистанционный доступ к счетам, вкладам, кредитам, картам и платежам через интернет-банк.'],
      ['Подтверждение операций', 'Переводы подтверждаются одноразовым кодом. Для повышения защиты рекомендуется включить двухфакторную аутентификацию на странице «Безопасность».'],
      ['Ответственность', 'Клиент не передаёт пароль и коды третьим лицам. Банк никогда не запрашивает их по телефону.']
    ]
  },
  tariffs: {
    title: 'Тарифы',
    blocks: [
      ['Обслуживание', 'Открытие счёта и ведение счёта в интернет-банке бесплатно.'],
      ['Переводы', 'Комиссия за переводы другим клиентам и в другие банки и лимиты задаются сотрудником банка и показываются перед подтверждением операции.'],
      ['Конвертация', 'Применяются курсы банка: официальный курс Национального банка со спредом на покупку и продажу. Актуальные значения на странице «Курсы».']
    ]
  },
  license: {
    title: 'Лицензия Национального банка',
    blocks: [
      ['Статус проекта', 'ТалерБанк является учебным проектом и не осуществляет банковскую деятельность. Реальной лицензии у него нет, а все данные в системе демонстрационные.']
    ]
  },
  forgot: {
    title: 'Восстановление пароля',
    blocks: [
      ['Как восстановить доступ', 'Обратитесь к сотруднику банка: после проверки личности он сможет снять блокировку и выдать временный пароль. Самостоятельный сброс письмом в учебной версии не предусмотрен.'],
      ['Если вы подозреваете взлом', 'Сразу сообщите в банк, чтобы доступ был заблокирован. Банк никогда не просит назвать пароль или код из SMS.']
    ]
  }
};

export function info(req, res, next) {
  const key = req.params.slug || req.path.slice(1);
  const page = INFO[key];
  if (!page) return next();
  res.render('pages/info', { title: page.title, blocks: page.blocks });
}

/** JSON-индекс для поиска в шапке. */
export async function searchIndex(req, res) {
  res.json(await searchService.buildIndex(req.user));
}
