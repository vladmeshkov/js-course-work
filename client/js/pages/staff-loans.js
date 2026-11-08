import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount, percent } from '../lib/format.js';

/** Очередь заявок на кредит, ожидающих решения кредитного специалиста. */
export default async function page() {
  const { applications } = await api.get('/staff/loans');
  return {
    title: 'Заявки на кредит',
    body: html`<div class="q-head"><h1>Заявки на кредит</h1><div class="muted">${applications.length ? `В очереди: ${applications.length}` : 'Очередь пуста'}</div></div>
${!applications.length ? html`<section class="panel"><p class="muted m0">Заявок на рассмотрении нет.</p></section>` : ''}
<section class="stubs" aria-label="Очередь заявок">
  ${applications.map((a) => html`<a class="stub" href="/staff/loans/${a.id}">
      <span class="stub__top"><span class="muted2">№ ${a.id}</span><b class="stub__st">на рассмотрении</b></span>
      <span class="stub__name">${a.last_name} ${a.first_name}</span>
      <span class="stub__sum">${formatAmount(a.amount)} <small>BYN</small></span>
      <span class="stub__meta">${a.product_name}, балл ${a.score}, нагрузка ${percent(a.dti_percent)}%</span>
    </a>`)}
</section>`
  };
}
