import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs, bindForm, errorSlot, formError, flash } from '../lib/ui.js';
import { formatAmount, parseAmount, dmy, percent } from '../lib/format.js';

const STATUS_NAMES = { planned: 'ожидается', paid: 'оплачен', overdue: 'просрочен' };
const payment = (r) => r.principal + r.interest + r.penalty;

/** Договор кредита: остаток, досрочное погашение (частичное и полное), ближайшие платежи и график. */
export default async function page({ params, navigate }) {
  const { loan, schedule, dpd, next, quote } = await api.get(`/loans/${params.id}`);
  const active = loan.status === 'active';
  const paidPct = Math.round(((loan.amount - loan.principal_balance) / loan.amount) * 100);
  const upcoming = schedule.filter((r) => r.status !== 'paid').slice(0, 3);
  return {
    title: `Кредит № ${loan.id}`,
    body: html`${crumbs([['Главная', '/'], ['Кредиты', '/loans'], `Договор № ${loan.id}`])}
<section class="panel loan-hero">
  <div class="muted2">Остаток долга, договор № ${loan.id}${active ? '' : ' (погашен)'}</div>
  <div class="balance-big">${formatAmount(loan.principal_balance)} <small class="muted unit">BYN</small></div>
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${paidPct}" aria-label="Погашено"><span class="progress__fill" data-progress="${paidPct}"></span></div>
  <p class="muted2 small mt8">Погашено ${paidPct}% от ${formatAmount(loan.amount)} BYN</p>
  <dl class="facts">
    <div><dt>Выдано</dt><dd>${formatAmount(loan.amount)} BYN</dd></div>
    <div><dt>Ставка</dt><dd>${percent(loan.rate_percent)}% годовых</dd></div>
    <div><dt>Следующий платёж</dt><dd>${next ? `${dmy(next.due_date)}, ${formatAmount(payment(next))} BYN` : '—'}</dd></div>
    ${dpd > 0 ? html`<div><dt>Просрочка</dt><dd class="text-bad">${dpd} дн.</dd></div>` : ''}
  </dl>
</section>
${active ? html`<section class="repay">
  <div class="repay__main">
    <div class="chips" role="tablist" aria-label="Вид погашения">
      <button class="chip" type="button" role="tab" aria-selected="true" data-repay-tab="partial">Частично досрочно</button>
      <button class="chip" type="button" role="tab" aria-selected="false" data-repay-tab="full">Полностью</button>
    </div>
    <form class="panel form" id="repay-partial" novalidate>
      ${formError()}
      <div class="field"><label for="amount">Сумма платежа, BYN</label><input class="repay__amount" id="amount" name="amount" inputmode="decimal" autocomplete="off"><span class="field__hint" id="repay-msg">Введите сумму досрочного платежа.</span>${errorSlot('amount')}</div>
      <fieldset class="seg">
        <legend>После частичного платежа</legend>
        <div class="seg__in">
          <label><input type="radio" name="mode" value="term" checked><span>Сократить срок</span></label>
          <label><input type="radio" name="mode" value="payment"><span>Снизить платёж</span></label>
        </div>
      </fieldset>
      <p class="repay__effect" id="repay-effect">Платёж по графику останется прежним, срок сократится.</p>
      <p class="muted2 m0 small">Дополнительно списываются проценты с даты последнего платежа по сегодня.</p>
      <div><button class="btn btn--lg" type="submit">Погасить часть</button></div>
    </form>
    <form class="panel form" id="repay-full" hidden>
      <dl class="facts m0">
        <div><dt>Основной долг</dt><dd>${formatAmount(quote.principal)}</dd></div>
        <div><dt>Проценты на сегодня</dt><dd>${formatAmount(quote.interest)}</dd></div>
        ${quote.penalty > 0 ? html`<div><dt>Пеня</dt><dd>${formatAmount(quote.penalty)}</dd></div>` : ''}
      </dl>
      <p class="repay__effect">Кредит будет закрыт сегодня, дальнейших процентов не будет.</p>
      <div class="amount">${formatAmount(quote.total)} <small>BYN</small></div>
      ${formError()}
      <div><button class="btn btn--lg" type="submit">Погасить полностью</button></div>
    </form>
  </div>
  <aside class="panel upcoming">
    <h2>Ближайшие платежи</h2>
    ${upcoming.map((r) => html`<div class="upcoming__row"><div><b>${dmy(r.due_date)}</b><small>долг ${formatAmount(r.principal)}, проценты ${formatAmount(r.interest)}</small></div><b>${formatAmount(payment(r))}</b></div>`)}
    <p class="muted2 small m0">Плановые платежи списываются автоматически при закрытии операционного дня.</p>
  </aside>
</section>` : ''}
<section class="panel">
  <h2 class="mb14">График платежей</h2>
  <div class="scroll-x"><table class="table">
    <thead><tr><th>№</th><th>Дата</th><th>Долг</th><th>Проценты</th><th>Пеня</th><th>Платёж</th><th>Статус</th></tr></thead>
    <tbody>
      ${schedule.map((r) => html`<tr class="${r.status === 'overdue' ? 'row--bad' : r.status === 'paid' ? 'row--done' : ''}">
          <td>${r.no}</td><td>${dmy(r.due_date)}</td><td>${formatAmount(r.principal)}</td><td>${formatAmount(r.interest)}</td>
          <td>${r.penalty ? formatAmount(r.penalty) : ''}</td><td><b>${formatAmount(payment(r))}</b></td><td>${STATUS_NAMES[r.status]}</td>
        </tr>`)}
    </tbody>
  </table></div>
</section>`,
    mount(root) {
      const partial = root.querySelector('#repay-partial');
      const full = root.querySelector('#repay-full');
      if (!partial || !full) return;

      const tabs = root.querySelectorAll('[data-repay-tab]');
      tabs.forEach((tab) => tab.addEventListener('click', () => {
        const isFull = tab.dataset.repayTab === 'full';
        full.hidden = !isFull;
        partial.hidden = isFull;
        tabs.forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
      }));

      const input = partial.querySelector('.repay__amount');
      const msg = root.querySelector('#repay-msg');
      const effect = root.querySelector('#repay-effect');
      const balance = loan.principal_balance;
      function update() {
        const minor = parseAmount(input.value);
        if (!input.value) msg.textContent = 'Введите сумму досрочного платежа.';
        else if (minor === null || minor <= 0) msg.textContent = 'Введите сумму, например 500,00.';
        else if (minor >= balance) msg.textContent = 'Сумма не меньше остатка долга. Выберите «Полностью».';
        else msg.textContent = `Остаток долга после платежа: ${formatAmount(balance - minor)} BYN.`;
        const mode = partial.querySelector('input[name="mode"]:checked').value;
        effect.textContent = mode === 'term' ? 'Платёж по графику останется прежним, срок сократится.' : 'Срок останется прежним, ежемесячный платёж станет меньше.';
      }
      input.addEventListener('input', update);
      partial.addEventListener('change', update);
      update();

      bindForm(partial, async (data) => {
        await api.post(`/loans/${loan.id}/repay-partial`, data);
        flash('success', 'Досрочный платёж принят, график пересчитан');
        await navigate(`/loans/${loan.id}`, { replace: true });
      });
      bindForm(full, async () => {
        await api.post(`/loans/${loan.id}/repay-full`);
        flash('success', 'Кредит полностью погашен');
        await navigate('/loans');
      });
    }
  };
}
