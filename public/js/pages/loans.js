import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount, dmy, percent } from '../lib/format.js';

const LABELS = { manual_review: 'на рассмотрении', approved: 'одобрена', rejected: 'отклонена', signed: 'договор подписан' };

/** Каталог кредитов (открыт гостю), кредиты и заявки вошедшего клиента. */
export default async function page() {
  const { products, loans, applications } = await api.get('/loans');
  const open = applications.filter((a) => a.status !== 'signed');
  return {
    title: 'Кредиты',
    body: html`${crumbs([['Главная', '/'], 'Кредиты'])}
<h1>Кредиты</h1>
<section class="tiles">
  ${products.map((p) => html`<a class="tile-link" href="/loans/new?product=${p.id}">
      <h3>${p.name}</h3>
      <div class="rate">${percent(p.rate_percent)}%<small> годовых</small></div>
      <span class="muted">От ${formatAmount(p.min_amount)} до ${formatAmount(p.max_amount)} BYN<br>Срок от ${p.min_term} до ${p.max_term} мес.<br>Аннуитетные или дифференцированные платежи</span>
    </a>`)}
</section>
${loans.length ? html`<section class="tile">
  <h2 class="mb10">Мои кредиты</h2>
  ${loans.map((l) => html`<a class="account" href="/loans/${l.id}">
      <div><div class="account__title">Договор № ${l.id}${l.status === 'active' ? '' : ' (погашен)'}</div>
        <div class="account__iban">${l.status === 'active' && l.next_due ? `следующий платёж ${dmy(l.next_due)}` : `${percent(l.rate_percent)}%`}</div></div>
      <div class="amount">${formatAmount(l.principal_balance)} <small>BYN</small></div>
    </a>`)}
</section>` : ''}
${open.length ? html`<section class="tile">
  <h2 class="mb10">Мои заявки</h2>
  ${open.map((a) => html`<a class="account" href="/loans/applications/${a.id}">
      <div><div class="account__title">Заявка № ${a.id}, ${a.product_name}</div><div class="account__iban">${LABELS[a.status]}</div></div>
      <div class="amount">${formatAmount(a.amount)} <small>BYN</small></div>
    </a>`)}
</section>` : ''}`
  };
}
