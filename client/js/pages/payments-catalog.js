import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount } from '../lib/format.js';
import { servicesWord } from '../lib/payments-ui.js';

export default async function page({ query, navigate }) {
  const { categories, found, q, popular, templates, autopayments } = await api.get('/payments/catalog', { q: query.q, city: query.city });
  return {
    title: 'Каталог платежей',
    body: html`${crumbs([['Главная', '/cabinet'], 'Платежи'])}
<div class="pay-head">
  <h1>Оплата услуг</h1>
  <form class="pay-search" id="search-form" role="search">
    <label for="find">Найти услугу</label>
    <input id="find" name="q" value="${q}" placeholder="Квартплата, МТС, налог" autocomplete="off">
  </form>
</div>
${q ? html`<section class="panel pay-found">
    ${found.map((p) => html`<a class="pay-row" href="/payments/pay/${p.id}"><span><b>${p.name}</b><small>${p.category_name}</small></span><span class="pay-row__go">→</span></a>`)}
    ${found.length ? '' : html`<div class="pay-empty">Такой услуги нет в каталоге. Попробуйте другое слово.</div>`}
  </section>` : html`
<section class="cat-grid">
  ${categories.map((c, i) => html`<a class="cat-tile cat-tile--${i + 1}" href="/payments/catalog/${c.id}">
      <span class="cat-tile__name">${c.name}</span>
      <span class="cat-tile__hint">${c.count} ${servicesWord(c.count)}</span>
      <img src="/img/3d/${c.icon}.png" alt="" loading="lazy">
    </a>`)}
</section>
<section class="pay-two">
  <div class="panel pay-two__pop">
    <h2>Популярное</h2>
    <div class="chips">
      ${popular.map((p) => html`<a class="chip" href="/payments/pay/${p.id}">${p.name}</a>`)}
    </div>
  </div>
  <div class="panel pay-two__tpl">
    <h2>Шаблоны и автоплатежи</h2>
    ${templates.length ? '' : html`<p class="muted m0">Сохраните платёж как шаблон при оплате, и он появится здесь.</p>`}
    ${templates.map((t) => {
      const auto = autopayments.find((a) => a.template_id === t.id);
      return html`<a class="tpl-row" href="/payments/pay/${t.provider_id}?template=${t.id}">
        <span><b>${t.name}</b><small>${t.requisite_label} ${t.requisite}${auto ? ', автоплатёж каждое ' + auto.day_of_month + '-е число' : ''}</small></span>
        <b>${t.amount ? formatAmount(t.amount) + ' BYN' : ''}</b>
      </a>`;
    })}
    <a class="link" href="/payments">Управлять шаблонами</a>
  </div>
</section>`}`,
    mount(root) {
      root.querySelector('#search-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const text = root.querySelector('#find').value.trim();
        navigate(text ? `/payments/catalog?q=${encodeURIComponent(text)}` : '/payments/catalog');
      });
    }
  };
}
