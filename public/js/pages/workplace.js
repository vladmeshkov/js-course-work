import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { dmy } from '../lib/format.js';

export default async function page({ session }) {
  const { bankDate, metrics, queues, admin } = await api.get('/workplace');
  return {
    title: 'Рабочее место',
    body: html`<div class="between">
  <div><p class="overview__hello m0">${session.user.roleName}, ${session.user.login}</p><h1>Рабочее место</h1></div>
  <div class="bankdate"><span class="muted2 small">Банковская дата</span><b>${dmy(bankDate)}</b></div>
</div>
${!metrics.length && !queues.length && !admin ? html`<div class="alert alert--info">Для вашей роли пока нет доступных разделов.</div>` : ''}
${metrics.length ? html`<section class="metrics">
  ${metrics.map((m) => html`<a class="metric${m.hot ? ' metric--hot' : ''}" href="${m.href}"><span class="metric__value">${m.value}</span><span class="metric__label">${m.label}</span></a>`)}
</section>` : ''}
${queues.length ? html`<section class="split split--even">
  ${queues.map((q) => html`<div class="tile">
      <div class="between"><h2>${q.title}</h2><a class="link" href="${q.href}">Все</a></div>
      ${q.items.length ? '' : html`<p class="muted m0 mt10">${q.empty}</p>`}
      ${q.items.map((i) => html`<a class="op" href="${i.href}"><div><div class="op__title">${i.title}</div><div class="op__meta">${i.meta}</div></div><span class="link">Открыть</span></a>`)}
    </div>`)}
</section>` : ''}
${admin ? html`<section class="split split--even">
  ${admin.events.length ? html`<div class="tile">
    <div class="between"><h2>Последние события</h2><a class="link" href="/admin/audit">Журнал</a></div>
    ${admin.events.map((e) => html`<div class="op"><div><div class="op__title">${e.action}</div><div class="op__meta">${e.login || 'система'}, ${new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')}</div></div><span class="${e.result === 'success' ? 'text-good' : 'text-bad'}">${e.result === 'success' ? 'успех' : 'отказ'}</span></div>`)}
  </div>` : ''}
  <div class="tile">
    <h2 class="mb10">Состояние системы</h2>
    ${admin.showTrial ? html`<div class="op"><div class="op__title">Двойная запись</div><b class="${admin.balanced ? 'text-good' : 'text-bad'}">${admin.balanced ? 'сходится' : 'есть расхождение'}</b></div>` : ''}
    ${admin.showBackup ? html`<div class="op"><div class="op__title">Последняя резервная копия</div><b class="${admin.lastBackup ? '' : 'text-bad'}">${admin.lastBackup || 'ещё не создавалась'}</b></div>` : ''}
    <div class="actions mt10">${admin.showTrial ? html`<a class="btn btn--ghost btn--small" href="/admin/eod">Операционный день</a>` : ''}${admin.showBackup ? html`<a class="btn btn--ghost btn--small" href="/admin/backups">Копии</a>` : ''}</div>
  </div>
</section>` : ''}`
  };
}
