import { html } from '../lib/html.js';
import { api, query, ApiError } from '../lib/api.js';
import { showAlert } from '../lib/ui.js';
import { stamp, replaceUrl } from '../lib/admin-ui.js';

const PERIODS = [[1, 'Сутки'], [3, 'Три дня'], [7, 'Неделя']];

/** Таблица записей журнала: строка раскрывается и показывает адрес и подробности. */
function table(rows) {
  return html`<div class="scroll-x"><table class="table table--ledger">
    <thead><tr><th>№</th><th>Дата и время</th><th>Пользователь</th><th>Событие</th><th>Объект</th><th>Результат</th><th>Адрес</th></tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr class="audit-row" tabindex="0" data-audit-toggle="a${r.id}" aria-expanded="false"><td>${r.id}</td><td>${stamp(r.at, 19)}</td><td>${r.login || '—'}</td><td>${r.action}</td>
          <td>${r.entity ? r.entity + ' ' + (r.entity_id ?? '') : ''}</td><td class="${r.result === 'success' ? 'text-good' : 'text-bad'}">${r.result === 'success' ? 'успех' : 'отказ'}</td><td>${r.ip || ''}</td></tr>
        <tr class="audit-detail" id="a${r.id}" hidden><td colspan="7"><span class="muted2">Адрес</span> <b>${r.ip || '—'}</b> &nbsp; <span class="muted2">Подробности</span> <code class="audit-json">${JSON.stringify(r.details)}</code></td></tr>`)}
    </tbody>
  </table></div>
  ${rows.length ? '' : html`<p class="muted m0">Записей нет.</p>`}`;
}

export default async function page({ query: params }) {
  const { rows, filters } = await api.get('/admin/audit', params);
  return {
    title: 'Журнал аудита',
    body: html`<div class="q-head"><div><h1>Журнал аудита</h1><div class="muted" id="audit-count">Показано записей: ${rows.length}</div></div><a class="btn btn--ghost" href="/admin/backups">Резервные копии</a></div>
<form class="panel search" id="audit-filter" role="search">
  <input name="login" value="${filters.login}" placeholder="Пользователь" aria-label="Пользователь">
  <input name="action" value="${filters.action}" placeholder="Событие, например transfer" aria-label="Событие">
  <select name="days" aria-label="Период"><option value="">Весь период</option>${PERIODS.map(([d, name]) => html`<option value="${d}"${filters.days === d ? ' selected' : ''}>${name}</option>`)}</select>
  <select name="result" aria-label="Результат"><option value="">Любой результат</option><option value="success"${filters.result === 'success' ? ' selected' : ''}>Успех</option><option value="failure"${filters.result === 'failure' ? ' selected' : ''}>Отказ</option></select>
  <button class="btn" type="submit">Показать</button>
</form>
<section class="paper paper--table">
  <div id="audit-table">${table(rows)}</div>
  <p class="muted2 small mt10 m0">Журнал только дописывается: записи нельзя изменить или удалить, это обеспечивает база данных.</p>
</section>`,
    mount(root) {
      const form = root.querySelector('#audit-filter');
      const target = root.querySelector('#audit-table');
      const toggle = (row) => {
        const detail = root.querySelector(`#${row.dataset.auditToggle}`);
        if (!detail) return;
        detail.hidden = !detail.hidden;
        row.setAttribute('aria-expanded', String(!detail.hidden));
      };
      target.addEventListener('click', (event) => {
        const row = event.target.closest('[data-audit-toggle]');
        if (row) toggle(row);
      });
      target.addEventListener('keydown', (event) => {
        const row = event.target.closest?.('[data-audit-toggle]');
        if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle(row); }
      });
      // фильтры применяются без перезагрузки страницы: обновляются список и адрес
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.classList.add('is-loading');
        try {
          const filter = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, String(value).trim()]));
          const result = await api.get('/admin/audit', filter);
          target.innerHTML = table(result.rows).toString();
          root.querySelector('#audit-count').textContent = `Показано записей: ${result.rows.length}`;
          replaceUrl('/admin/audit', query(filter));
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          showAlert(root, 'error', error.message);
        } finally {
          button.classList.remove('is-loading');
        }
      });
    }
  };
}
