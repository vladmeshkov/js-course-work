import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount, dmy } from '../lib/format.js';

export default async function page() {
  const { queue, batches, banks } = await api.get('/admin/clearing');
  return {
    title: 'Клиринг',
    body: html`<h1>Клиринг</h1>
<section class="tile">
  <h2 class="mb10">Очередь на отправку</h2>
  <p class="muted2 small m0 mb10">Платежи уйдут пакетом при ближайшем закрытии операционного дня.</p>
  ${queue.length ? '' : html`<p class="muted m0">Очередь пуста.</p>`}
  ${queue.map((q) => html`<div class="account"><div><div class="account__title">${q.counterparty_name}, ${q.bank_name}</div><div class="account__iban">платёж № ${q.id}, комиссия ${formatAmount(q.fee)} BYN${q.active ? '' : ', банк не принимает платежи'}</div></div><div class="amount">${formatAmount(q.amount)} <small>BYN</small></div></div>`)}
</section>
<section class="split split--even">
  <div class="tile">
    <h2 class="mb10">Клиринговые пакеты</h2>
    ${batches.length ? '' : html`<p class="muted m0">Пакетов пока не было.</p>`}
    ${batches.map((b) => html`<div class="account"><div><div class="account__title">${dmy(b.bank_date)}</div><div class="account__iban">отправлено ${b.transfers}, отклонено ${b.rejected}</div></div><div class="amount">${formatAmount(b.total)} <small>BYN</small></div></div>`)}
  </div>
  <div class="tile">
    <h2 class="mb10">Банки-контрагенты</h2>
    ${banks.map((b) => html`<div class="account"><div><div class="account__title">${b.name}</div><div class="account__iban">код ${b.code}, BIC ${b.bic}</div></div><span class="${b.active ? 'text-good' : 'text-bad'}">${b.active ? 'принимает платежи' : 'не принимает'}</span></div>`)}
  </div>
</section>`
  };
}
