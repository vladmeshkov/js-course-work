import { navFor } from '../lib/navigation.js';
import { formatAmount } from '../lib/money.js';
import { formatIban } from '../lib/iban.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from './accountService.js';
import * as cardService from './cardService.js';
import * as paymentService from './paymentService.js';

/**
 * Индекс быстрого поиска из шапки: разделы, действия, каталог платежей, счета и карты клиента.
 * @returns {Promise<{group: string, cat: string, mark: string, title: string, sub: string, hint: string, href: string}[]>}
 */
export async function buildIndex(user) {
  if (!user) {
    return [
      { group: 'Разделы', cat: 'Действия', mark: 'Вк', title: 'Вклады', sub: 'Ставки и калькулятор дохода', hint: 'Вклады', href: '/deposits' },
      { group: 'Разделы', cat: 'Действия', mark: 'Кр', title: 'Кредиты', sub: 'Расчёт платежа и графика', hint: 'Кредиты', href: '/loans' },
      { group: 'Разделы', cat: 'Действия', mark: 'Кв', title: 'Курсы валют', sub: 'Конвертер и курсы банка', hint: 'Курсы', href: '/rates' },
      { group: 'Разделы', cat: 'Действия', mark: 'Вх', title: 'Войти в интернет-банк', sub: 'Логин и пароль', hint: 'Вход', href: '/login' }
    ];
  }
  if (user.role_code !== 'client') {
    return navFor(user).map((i) => ({ group: 'Разделы', cat: 'Действия', mark: i.label.slice(0, 2), title: i.label, sub: '', hint: 'Раздел', href: i.href }));
  }
  const items = [
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Пр', title: 'Перевод клиенту банка', sub: 'По номеру счёта, с подтверждением кодом', hint: 'Переводы', href: '/transfers/new?kind=client' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Мс', title: 'Перевод между своими счетами', sub: 'Мгновенно, с конвертацией', hint: 'Переводы', href: '/transfers/new?kind=own' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Бн', title: 'Перевод в другой банк', sub: 'Через клиринг', hint: 'Переводы', href: '/transfers/interbank' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Вк', title: 'Вклады', sub: 'Открыть вклад, рассчитать доход', hint: 'Вклады', href: '/deposits' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Кр', title: 'Кредиты', sub: 'Расчёт графика и заявка', hint: 'Кредиты', href: '/loans' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Сч', title: 'Открыть счёт', sub: 'BYN, USD, EUR, RUB, CNY', hint: 'Счета', href: '/accounts/new' },
    { group: 'Быстрые действия', cat: 'Действия', mark: 'Кв', title: 'Курсы валют', sub: 'Конвертер', hint: 'Курсы', href: '/rates' }
  ];
  for (const c of await paymentService.catalog.categories()) {
    items.push({ group: 'Каталог платежей', cat: 'Каталог', mark: c.name.slice(0, 2), title: c.name, sub: c.hint, hint: 'Платежи', href: `/payments/catalog/${c.id}` });
  }
  for (const p of await paymentService.catalog.providers({})) {
    items.push({ group: 'Каталог платежей', cat: 'Каталог', mark: p.name.slice(0, 2), title: p.name, sub: p.category_name, hint: 'Оплатить', href: `/payments/pay/${p.id}` });
  }
  const client = await clientModel.findByUserId(user.id);
  if (client) {
    for (const a of await accountService.listForClient(client.id)) {
      items.push({ group: 'Мои данные', cat: 'Счета', mark: a.currency, title: a.title, sub: formatIban(a.iban), hint: `${formatAmount(a.balance)} ${a.currency}`, href: `/accounts/${a.id}` });
    }
  }
  for (const c of await cardService.listForClient(user.id)) {
    items.push({ group: 'Мои данные', cat: 'Карты', mark: 'Кт', title: `Карта ${c.last4}`, sub: `${cardService.SYSTEMS[c.system]}, до ${c.expires}`, hint: 'Карты', href: `/cards/${c.id}` });
  }
  return items;
}
