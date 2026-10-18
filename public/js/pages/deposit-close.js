import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, formError, flash } from '../lib/ui.js';
import { formatAmount, percent } from '../lib/format.js';

/** Досрочное закрытие вклада: расчёт пересчёта процентов и подтверждение. */
export default async function page({ params, navigate }) {
  const { quote } = await api.get(`/deposits/${params.id}/close`);
  const d = quote.deposit;
  return {
    title: 'Досрочное закрытие вклада',
    body: html`<h1>Закрыть вклад досрочно</h1>
<form class="tile form w640" id="close-form">
  <p class="muted m0">При досрочном закрытии весь срок пересчитывается по ставке «до востребования» (${percent(d.demand_rate_percent)}%). Излишне начисленные проценты удерживаются.</p>
  <dl class="facts">
    <div><dt>Сумма на вкладе</dt><dd>${formatAmount(d.balance)} ${d.currency}</dd></div>
    <div><dt>Проценты по ставке вклада</dt><dd>${formatAmount(quote.paidInterest)}</dd></div>
    <div><dt>Проценты по ставке до востребования</dt><dd>${formatAmount(quote.demandInterest)}</dd></div>
    <div><dt>Пересчёт</dt><dd>${quote.adjustment >= 0 ? '+' : ''}${formatAmount(quote.adjustment)}</dd></div>
  </dl>
  <div><div class="muted2">Вы получите на текущий счёт</div><div class="balance-big balance-mid">${formatAmount(quote.payout)} <small class="muted unit unit--sm">${d.currency}</small></div></div>
  ${formError()}
  <div class="actions"><button class="btn" type="submit">Закрыть вклад</button><a class="link" href="/deposits/${d.id}">Отмена</a></div>
</form>`,
    mount(root) {
      bindForm(root.querySelector('#close-form'), async () => {
        await api.post(`/deposits/${d.id}/close`);
        flash('success', 'Вклад закрыт, деньги возвращены на текущий счёт');
        await navigate('/accounts');
      });
    }
  };
}
