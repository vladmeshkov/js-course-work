import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

export default async function page() {
  const { clients } = await api.get('/staff/kyc');
  return {
    title: 'Анкеты клиентов',
    body: html`<h1>Анкеты клиентов</h1>
<section class="tile">
  ${clients.length ? '' : html`<p class="muted m0">Новых заявок нет.</p>`}
  ${clients.map((c) => html`<a class="account" href="/staff/kyc/${c.id}"><div><div class="account__title">${c.last_name} ${c.first_name} ${c.patronymic || ''}</div><div class="account__iban">${c.login}, ${c.phone}, подана ${String(c.created_at).slice(0, 10)}</div></div><span class="link">Проверить &nbsp;→</span></a>`)}
</section>`
  };
}
