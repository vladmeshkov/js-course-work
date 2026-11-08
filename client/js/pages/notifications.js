import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

export default async function page({ refreshSession }) {
  const { items } = await api.get('/notifications');
  await refreshSession();   // счётчик в шапке: теперь всё прочитано
  return {
    title: 'Уведомления',
    body: html`<h1>Уведомления</h1>
<section class="tile">
  ${items.length ? '' : html`<p class="muted m0">Уведомлений пока нет.</p>`}
  ${items.map((n) => html`<div class="note${n.read_at ? '' : ' note--new'}">
      <div class="note__head"><b>${n.link ? html`<a class="link" href="${n.link}">${n.title}</a>` : n.title}</b><span class="muted2 small">${new Date(n.created_at).toISOString().slice(0, 16).replace('T', ' ')}</span></div>
      ${n.body ? html`<div class="muted">${n.body}</div>` : ''}
    </div>`)}
</section>`
  };
}
