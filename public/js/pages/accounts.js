import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount, formatIban } from '../lib/format.js';

/** Счета и карты: список счетов клиента. */
export default async function page() {
  const { accounts } = await api.get('/accounts');
  return {
    title: 'Счета и карты',
    body: html`${crumbs([['Главная', '/cabinet'], 'Счета и карты'])}
<h1>Счета и карты</h1>
<section class="tile">
  ${accounts.length ? '' : html`<p class="muted m0">Счетов пока нет.</p>`}
  ${accounts.map((a) => html`<a class="account" href="/accounts/${a.id}">
      <div>
        <div class="account__title">${a.title}${a.status === 'frozen' ? ' (заблокирован)' : ''}</div>
        <div class="account__iban">${formatIban(a.iban)}</div>
      </div>
      <div class="amount">${formatAmount(a.balance)} <small>${a.currency}</small></div>
    </a>`)}
</section>
<div class="actions"><a class="btn" href="/accounts/new">Открыть счёт</a><a class="btn btn--ghost" href="/cards">Мои карты</a></div>`
  };
}
