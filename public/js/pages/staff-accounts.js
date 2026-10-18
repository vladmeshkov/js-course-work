import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount, formatIban } from '../lib/format.js';
import { flash } from '../lib/ui.js';
import { bindChoiceForm } from '../lib/staff-choice.js';

export default async function page({ query, navigate }) {
  const q = String(query.q ?? '').trim();
  const { accounts } = await api.get('/staff/accounts', { q });
  return {
    title: 'Счета клиентов',
    body: html`<h1>Счета клиентов</h1>
<form class="tile search" id="search-form" role="search">
  <input name="q" value="${q}" placeholder="Логин клиента или часть номера счёта" aria-label="Поиск счёта">
  <button class="btn" type="submit">Найти</button>
</form>
${q ? html`<section class="tile">
  ${accounts.length ? '' : html`<p class="muted m0">Счетов не найдено.</p>`}
  ${accounts.map((a) => html`<div class="account">
      <div><div class="account__title">${a.last_name} ${a.first_name}, ${a.title}</div><div class="account__iban">${formatIban(a.iban)}, ${formatAmount(a.balance)} ${a.currency}, <span class="${a.status === 'open' ? 'text-good' : 'text-bad'}">${a.status === 'open' ? 'открыт' : 'заблокирован'}</span></div></div>
      <form class="actions" data-freeze="${a.id}">
        ${a.status === 'open'
          ? html`<input class="mini mini--wide" name="reason" placeholder="Основание блокировки" aria-label="Основание блокировки"><button class="btn btn--ghost btn--small text-bad" type="submit" data-choice="freeze">Заблокировать</button>`
          : html`<button class="btn btn--ghost btn--small" type="submit" data-choice="unfreeze">Разблокировать</button>`}
      </form>
    </div>`)}
</section>` : ''}`,
    mount(root) {
      root.querySelector('#search-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const value = new FormData(event.target).get('q').trim();
        navigate(value ? `/staff/accounts?q=${encodeURIComponent(value)}` : '/staff/accounts', { replace: value === q });
      });
      root.querySelectorAll('form[data-freeze]').forEach((form) => bindChoiceForm(form, async (data, action) => {
        const result = await api.post(`/staff/accounts/${form.dataset.freeze}/freeze`, { action, reason: data.reason });
        flash('success', result.message);
        await navigate(location.pathname + location.search, { replace: true });
      }));
    }
  };
}
