import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount, dmy, percent } from '../lib/format.js';

const STATUS_SUFFIX = { active: '', closed: ' (закрыт)', early_closed: ' (закрыт досрочно)' };

/** Каталог вкладов (открыт гостю) и вклады вошедшего клиента. */
export default async function page() {
  const { products, mine } = await api.get('/deposits');
  return {
    title: 'Вклады',
    body: html`${crumbs([['Главная', '/'], 'Вклады'])}
<h1>Вклады</h1>
<section class="tiles">
  ${products.map((p) => html`<a class="tile-link" href="/deposits/new?product=${p.id}">
      <h3>«${p.name}»</h3>
      <div class="rate">${percent(p.rate_percent)}%<small> годовых</small></div>
      <span class="muted">${p.term_months} мес., от ${formatAmount(p.min_amount)} ${p.currency}<br>
        ${p.capitalization ? 'Проценты прибавляются к вкладу' : 'Проценты выплачиваются на счёт'}<br>
        ${p.revocable ? 'Можно закрыть досрочно' : 'Досрочное закрытие невозможно'}</span>
    </a>`)}
</section>
${mine.length ? html`<section class="tile">
  <h2 class="mb10">Мои вклады</h2>
  ${mine.map((d) => html`<a class="account" href="/deposits/${d.id}">
      <div>
        <div class="account__title">«${d.product_name}»${STATUS_SUFFIX[d.status] ?? ' (закрыт досрочно)'}</div>
        <div class="account__iban">до ${dmy(d.maturity_date)}, ${percent(d.rate_percent)}%</div>
      </div>
      <div class="amount">${formatAmount(d.status === 'active' ? d.balance : d.amount)} <small>${d.currency}</small></div>
    </a>`)}
</section>` : ''}`
  };
}
