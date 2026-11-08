import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';

export default async function page({ navigate }) {
  const { bankDate, balance } = await api.get('/admin/eod');
  return {
    title: 'Операционный день',
    body: html`<h1>Операционный день</h1>
<section class="tile form w720">
  <div><div class="muted2">Текущая банковская дата</div><div class="balance-big">${String(bankDate).slice(0, 10)}</div></div>
  <p class="muted m0">При закрытии дня банковская дата сдвигается вперёд, начисляются проценты по вкладам, закрываются вклады с наступившим сроком. Для показа можно прокрутить несколько дней.</p>
  <form class="actions actions--end" id="eod-form" novalidate>
    <div class="field w140"><label for="days">Сколько дней</label><input id="days" name="days" type="number" min="1" max="400" value="1">${errorSlot('days')}</div>
    <button class="btn" type="submit">Закрыть день</button>
  </form>
  ${formError()}
  <div>
    <div class="muted2 mb6">Контроль двойной записи (сумма остатков по валютам)</div>
    ${balance.map((b) => html`<div>${b.currency}: <b class="${b.ok ? 'text-good' : 'text-bad'}">${b.ok ? 'сходится' : 'расхождение ' + b.net}</b></div>`)}
  </div>
</section>`,
    mount(root) {
      bindForm(root.querySelector('#eod-form'), async (data) => {
        const result = await api.post('/admin/eod', data);
        flash('success', result.message);
        await navigate('/admin/eod', { replace: true });
      });
    }
  };
}
