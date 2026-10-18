import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount } from '../lib/format.js';

export default async function page() {
  const { cases, special } = await api.get('/staff/fraud');
  return {
    title: 'Антифрод',
    body: html`<h1>Антифрод</h1>
<section class="tile">
  <h2 class="mb10">Очередь на проверку</h2>
  ${cases.length ? '' : html`<p class="muted m0">Задержанных переводов нет.</p>`}
  ${cases.map((c) => html`<a class="account" href="/staff/fraud/${c.id}"><div><div class="account__title">${c.login}: ${formatAmount(c.amount)} ${c.currency}${c.interbank ? ' (в другой банк)' : ''}</div><div class="account__iban">случай № ${c.id}, риск ${c.score} баллов${c.special_control ? ', особый контроль' : ''}</div></div><span class="link">Рассмотреть &nbsp;→</span></a>`)}
</section>
<section class="tile">
  <h2 class="mb10">Операции особого контроля</h2>
  <p class="muted2 small mb10">Переводы на сумму не ниже порога по Закону № 165-З (порог задаётся в настройках).</p>
  ${special.length ? '' : html`<p class="muted m0">Таких операций пока нет.</p>`}
  ${special.map((c) => html`<div class="account"><div><div class="account__title">${c.login}</div><div class="account__iban">${new Date(c.created_at).toISOString().slice(0, 16).replace('T', ' ')}, случай № ${c.id}</div></div><div class="amount">${formatAmount(c.amount_byn)} <small>BYN</small></div></div>`)}
</section>`
  };
}
