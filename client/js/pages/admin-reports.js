import { html } from '../lib/html.js';
import { api, query, ApiError } from '../lib/api.js';
import { bindForm, errorSlot } from '../lib/ui.js';
import { formatAmount, percent } from '../lib/format.js';
import { replaceUrl } from '../lib/admin-ui.js';

const CURRENCIES = ['BYN', 'USD', 'EUR', 'RUB', 'CNY'];

const csvHref = (trial, currency) => `/api/admin/reports/trial.csv${query({ from: trial.from, to: trial.to, currency })}`;

/** Ведомость, показатели портфеля и операции: всё, что обновляется при смене периода. */
function report({ trial, portfolio, currency }) {
  return html`<section class="tile">
  <h2 class="mb10">Оборотно-сальдовая ведомость, ${currency}</h2>
  <div class="scroll-x"><table class="table table--num">
    <thead><tr><th>Счёт</th><th>Название</th><th>Остаток на начало</th><th>Оборот Дт</th><th>Оборот Кт</th><th>Остаток на конец</th></tr></thead>
    <tbody>
      ${trial.lines.map((l) => html`<tr><td>${l.code}</td><td>${l.name}</td><td>${formatAmount(l.opening)}</td><td>${formatAmount(l.debit)}</td><td>${formatAmount(l.credit)}</td><td>${formatAmount(l.closing)}</td></tr>`)}
      <tr class="row--total"><td></td><td>Итого</td><td>${formatAmount(trial.total.opening)}</td><td>${formatAmount(trial.total.debit)}</td><td>${formatAmount(trial.total.credit)}</td><td>${formatAmount(trial.total.closing)}</td></tr>
    </tbody>
  </table></div>
  <p class="mt10 m0 ${trial.balanced ? 'text-good' : 'text-bad'}"><b>${trial.balanced ? 'Ведомость сходится: обороты по Дт равны оборотам по Кт.' : 'Ведомость не сходится, нужна проверка проводок.'}</b></p>
  <p class="muted2 small m0">Остаток = обороты по Кт минус обороты по Дт. Дебетовое сальдо (касса, ссуды) показано отрицательным числом.</p>
</section>
<section class="row">
  <div class="tile grow">
    <h2 class="mb10">Кредитный портфель</h2>
    <dl class="facts"><div><dt>Действующих кредитов</dt><dd>${portfolio.loans.count}</dd></div><div><dt>Основной долг</dt><dd>${formatAmount(portfolio.loans.principal)} BYN</dd></div>
      <div><dt>Просроченный долг</dt><dd>${formatAmount(portfolio.loans.overduePrincipal)} BYN</dd></div><div><dt>Доля просрочки</dt><dd>${percent(portfolio.loans.overdueShare)}%</dd></div></dl>
    ${portfolio.loans.buckets.map((b) => html`<div class="account"><div class="account__title">${b.name}</div><div><span class="muted2">${b.count} кред.</span> &nbsp; <b>${formatAmount(b.principal)}</b></div></div>`)}
  </div>
  <div class="tile grow">
    <h2 class="mb10">Вклады</h2>
    ${portfolio.deposits.length ? '' : html`<p class="muted m0">Действующих вкладов нет.</p>`}
    ${portfolio.deposits.map((d) => html`<div class="account"><div class="account__title">${d.count} вкл., ${d.currency}</div><div class="amount">${formatAmount(d.total)} <small>${d.currency}</small></div></div>`)}
    <h2 class="mb10 mt10">Доходы и расходы</h2>
    ${portfolio.income.map((i) => html`<div class="account"><div class="account__title">Доходы, ${i.currency}</div><div class="amount text-good">${formatAmount(i.amount)}</div></div>`)}
    ${portfolio.expense.map((i) => html`<div class="account"><div class="account__title">Расходы (проценты по вкладам), ${i.currency}</div><div class="amount">${formatAmount(i.amount)}</div></div>`)}
  </div>
</section>
<section class="tile">
  <h2 class="mb10">Операции за 30 дней</h2>
  ${portfolio.operations.byType.map((t) => html`<div class="account"><div class="account__title">${t.type}</div><div><span class="muted2">${t.count} шт.</span> &nbsp; <b>${formatAmount(t.byn)} BYN</b></div></div>`)}
</section>`;
}

export default async function page({ query: params }) {
  let data;
  let periodError = '';
  try {
    data = await api.get('/admin/reports', params);
  } catch (error) {
    // неверный период в адресе: показываем ведомость за период по умолчанию и сообщение об ошибке
    if (!(error instanceof ApiError) || error.status !== 422) throw error;
    periodError = error.fields.from || error.message;
    data = await api.get('/admin/reports', { currency: params.currency });
  }
  const { trial, currency } = data;
  return {
    title: 'Отчёты',
    body: html`<h1>Отчёты</h1>
<form class="tile search" id="report-filter" novalidate>
  <label class="muted2" for="from">С</label><input id="from" name="from" type="date" value="${trial.from}">
  <label class="muted2" for="to">По</label><input id="to" name="to" type="date" value="${trial.to}">
  <select name="currency" aria-label="Валюта">${CURRENCIES.map((c) => html`<option${c === currency ? ' selected' : ''}>${c}</option>`)}</select>
  <button class="btn" type="submit">Показать</button>
  <a class="btn btn--ghost" id="csv-link" href="${csvHref(trial, currency)}">Скачать CSV</a>
  ${errorSlot('from')}
</form>
<div id="report">${report(data)}</div>`,
    mount(root) {
      const form = root.querySelector('#report-filter');
      if (periodError) {
        const slot = form.querySelector('[data-error="from"]');
        slot.textContent = periodError;
        slot.hidden = false;
      }
      bindForm(form, async (filter) => {
        const result = await api.get('/admin/reports', filter);
        root.querySelector('#report').innerHTML = report(result).toString();
        form.elements.from.value = result.trial.from;
        form.elements.to.value = result.trial.to;
        root.querySelector('#csv-link').setAttribute('href', csvHref(result.trial, result.currency));
        replaceUrl('/admin/reports', query({ from: result.trial.from, to: result.trial.to, currency: result.currency }));
      });
    }
  };
}
