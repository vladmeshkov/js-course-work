import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { formatAmount, formatIban, dmy } from '../lib/format.js';

const iso = (d) => d.toISOString().slice(0, 10);

/** Быстрые периоды: этот и прошлый месяц, три месяца, год. */
function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    ['Этот месяц', iso(new Date(Date.UTC(y, m, 1))), iso(now)],
    ['Прошлый месяц', iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))],
    ['3 месяца', iso(new Date(Date.UTC(y, m - 2, 1))), iso(now)],
    ['Год', iso(new Date(Date.UTC(y - 1, m, now.getDate()))), iso(now)]
  ];
}

/** Выписка по счёту: фильтры (счёт, период, вид операций) и талон с операциями по дням. */
export default async function page({ params, query, navigate }) {
  const path = `/accounts/${params.id}/statement`;
  let data;
  let errors = {};
  let kind = ['in', 'out'].includes(query.kind) ? query.kind : '';
  try {
    data = await api.get(path, { from: query.from, to: query.to });
  } catch (error) {
    // неверный период: показываем выписку по умолчанию и сообщение у поля
    if (!(error instanceof ApiError) || error.code !== 'validation') throw error;
    errors = error.fields;
    kind = '';
    data = await api.get(path);
    data.accounts = [];
  }
  const { statement, accounts } = data;
  const acc = statement.account;
  const base = `/accounts/${acc.id}/statement`;
  const shownOps = statement.operations.filter((o) => !kind || (kind === 'in' ? o.amount > 0 : o.amount < 0));
  const groups = [];
  for (const o of shownOps) {
    const d = String(o.date).slice(0, 10);
    let g = groups[groups.length - 1];
    if (!g || g.d !== d) { g = { d, rows: [] }; groups.push(g); }
    g.rows.push(o);
  }
  const period = `from=${statement.from}&to=${statement.to}`;
  return {
    title: 'Выписка по счёту',
    body: html`${crumbs([['Главная', '/cabinet'], ['Счета и карты', '/accounts'], [acc.title, `/accounts/${acc.id}`], 'Выписка'])}
<h1>Выписка по счёту</h1>
<form class="panel stmt-filter" id="stmt-form" novalidate>
  ${accounts.length > 1 ? html`<div class="stmt-filter__col">
    <div class="stmt-filter__label">Счёт</div>
    <div class="chips">
      ${accounts.map((a) => html`<a class="chip" aria-selected="${String(a.id === acc.id)}" href="/accounts/${a.id}/statement?${period}">${a.title}</a>`)}
    </div>
  </div>` : ''}
  <div class="stmt-filter__col">
    <div class="stmt-filter__label">Период</div>
    <div class="chips">
      ${presets().map((p) => html`<a class="chip" aria-selected="${String(p[1] === statement.from && p[2] === statement.to)}" href="${base}?from=${p[1]}&to=${p[2]}${kind ? '&kind=' + kind : ''}">${p[0]}</a>`)}
    </div>
  </div>
  <div class="stmt-filter__col">
    <div class="stmt-filter__label">Операции</div>
    <div class="chips">
      <a class="chip" aria-selected="${String(!kind)}" href="${base}?${period}">Все</a>
      <a class="chip" aria-selected="${String(kind === 'in')}" href="${base}?${period}&kind=in">Поступления</a>
      <a class="chip" aria-selected="${String(kind === 'out')}" href="${base}?${period}&kind=out">Списания</a>
    </div>
  </div>
  <div class="stmt-filter__col">
    <div class="stmt-filter__label">Свои даты</div>
    <div class="stmt-filter__dates">
      <label class="muted2" for="from">С</label><input id="from" name="from" type="date" value="${statement.from}">
      <label class="muted2" for="to">По</label><input id="to" name="to" type="date" value="${statement.to}">
      <button class="btn btn--small" type="submit">Показать</button>
    </div>
    ${errors.from ? html`<span class="field__error">${errors.from}</span>` : ''}
  </div>
</form>
<section class="talon-wide stmt">
  <div class="talon-wide__top">
    <div class="talon-wide__who"><img src="/img/emblem.png" alt="" width="48" height="48"><div><div class="muted2 small">ТалерБанк, выписка</div><div class="stmt__title">${acc.title}</div><div class="muted2 small">${formatIban(acc.iban)}, ${dmy(statement.from)} – ${dmy(statement.to)}</div></div></div>
    <div class="talon-wide__facts">
      <div><small>Входящий остаток</small><b>${formatAmount(statement.opening)}</b></div>
      <div><small>Исходящий остаток</small><b>${formatAmount(statement.closing)} ${acc.currency}</b></div>
    </div>
  </div>
  <div class="talon-wide__cut"></div>
  <div class="stmt__days">
    ${groups.map((g) => html`<div>
        <div class="stmt__day">${dmy(g.d)}</div>
        ${g.rows.map((o) => html`<div class="stmt__row">
            <span class="stmt__mark stmt__mark--${o.amount > 0 ? 'in' : 'out'}">${o.amount > 0 ? '+' : '−'}</span>
            <span class="stmt__what"><b>${o.description}</b><small>Остаток ${formatAmount(o.balance)}</small></span>
            <span class="stmt__amt${o.amount > 0 ? ' text-good' : ''}">${o.amount > 0 ? '+' : ''}${formatAmount(o.amount)}</span>
          </div>`)}
      </div>`)}
    ${groups.length ? '' : html`<div class="stmt__empty">За выбранный период операций нет. Выберите другой месяц.</div>`}
  </div>
  <div class="talon-wide__cut"></div>
  <div class="talon-wide__bottom">
    <div class="talon-wide__facts">
      <div><small>Поступления</small><b class="text-good">${formatAmount(statement.credit)}</b></div>
      <div><small>Списания</small><b>${formatAmount(statement.debit)}</b></div>
      <div><small>Операций</small><b>${shownOps.length}</b></div>
    </div>
    <a class="btn btn--lg" href="/api${base}.pdf?${period}">Скачать PDF</a>
  </div>
</section>`,
    mount(root) {
      // свои даты: переход на ту же страницу с новым периодом (вид операций сохраняется)
      root.querySelector('#stmt-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const f = event.currentTarget;
        navigate(`${base}?from=${encodeURIComponent(f.from.value)}&to=${encodeURIComponent(f.to.value)}${kind ? '&kind=' + kind : ''}`);
      });
    }
  };
}
