import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount, dmy, percent } from '../lib/format.js';

/** Карточка вклада клиента. */
export default async function page({ params }) {
  const { deposit, progress, daysLeft } = await api.get(`/deposits/${params.id}`);
  const active = deposit.status === 'active';
  const suffix = active ? '' : deposit.status === 'closed' ? ', закрыт по окончании срока' : ', закрыт досрочно';
  return {
    title: `Вклад «${deposit.product_name}»`,
    body: html`${crumbs([['Главная', '/'], ['Вклады', '/deposits'], `Вклад «${deposit.product_name}»`])}
<section class="tile">
  <div class="muted2">Вклад «${deposit.product_name}»${suffix}</div>
  <div class="balance-big">${formatAmount(active ? deposit.balance : deposit.amount)} <small class="muted unit">${deposit.currency}</small></div>
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="Прошло времени срока вклада"><span class="progress__fill" data-progress="${progress}"></span></div>
  <p class="muted2 small mt8">${active ? `Прошло ${progress}% срока, осталось ${daysLeft} дн.` : 'Срок завершён'}</p>
  <dl class="facts">
    <div><dt>Ставка</dt><dd>${percent(deposit.rate_percent)}% годовых</dd></div>
    <div><dt>Открыт</dt><dd>${dmy(deposit.opened_date)}</dd></div>
    <div><dt>Окончание</dt><dd>${dmy(deposit.maturity_date)}</dd></div>
    <div><dt>Начислено процентов</dt><dd>${formatAmount(deposit.interest_total)} ${deposit.currency}</dd></div>
    <div><dt>Проценты</dt><dd>${deposit.capitalization ? 'прибавляются к вкладу' : 'выплачиваются на счёт'}</dd></div>
  </dl>
  ${active ? (deposit.revocable
    ? html`<a class="btn btn--ghost" href="/deposits/${deposit.id}/close">Закрыть досрочно</a>`
    : html`<span class="muted2">Вклад безотзывный: досрочное закрытие невозможно.</span>`) : ''}
</section>`
  };
}
