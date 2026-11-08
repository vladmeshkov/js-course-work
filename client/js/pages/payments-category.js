import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { feeNote, servicesWord } from '../lib/payments-ui.js';

export default async function page({ params, query }) {
  const { category, providers } = await api.get(`/payments/catalog/${params.id}`, { city: query.city });
  return {
    title: category.name,
    body: html`${crumbs([['Главная', '/cabinet'], ['Платежи', '/payments/catalog'], category.name])}
<section class="pay-banner">
  <div><h1>${category.name}</h1><div class="muted2">${providers.length} ${servicesWord(providers.length)}</div></div>
  <img src="/img/3d/${category.icon}.png" alt="">
</section>
<section class="panel pay-found">
  ${providers.length ? '' : html`<div class="pay-empty">В этой категории пока нет организаций.</div>`}
  ${providers.map((p) => html`<a class="pay-row pay-row--icon" href="/payments/pay/${p.id}">
      <span class="pay-row__thumb"><img src="/img/3d/${category.icon}.png" alt=""></span>
      <span class="pay-row__txt"><b>${p.name}</b><small>${p.requisite_label}${p.city ? ', ' + p.city : ''}${feeNote(p.fee_percent)}</small></span>
      <span class="pay-row__go">→</span>
    </a>`)}
</section>`
  };
}
