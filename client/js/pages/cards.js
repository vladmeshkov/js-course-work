import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { cardClass, cardFace } from '../lib/accounts-cards.js';

/** Мои карты: при наличии карт открывается первая, иначе предложение выпустить карту. */
export default async function page() {
  const { cards, systems } = await api.get('/cards');
  if (cards.length) return { redirect: `/cards/${cards[0].id}` };
  return {
    title: 'Карты',
    body: html`${crumbs([['Главная', '/cabinet'], ['Счета и карты', '/accounts'], 'Карты'])}
<h1>Мои карты</h1>
<section class="card-row">
  ${cards.map((c) => html`<a class="${cardClass(c)}" href="/cards/${c.id}" aria-label="Карта ${systems[c.system]} с номером, оканчивающимся на ${c.last4}">${cardFace(c, systems)}</a>`)}
  <a class="bank-card bank-card--new" href="/cards/new"><span>Выпустить карту</span></a>
</section>`
  };
}
