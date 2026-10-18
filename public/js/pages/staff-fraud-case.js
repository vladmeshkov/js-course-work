import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount, formatIban } from '../lib/format.js';
import { crumbs, errorSlot, formError, flash } from '../lib/ui.js';
import { bindChoiceForm } from '../lib/staff-choice.js';

export default async function page({ params, navigate }) {
  const { fraudCase: c } = await api.get(`/staff/fraud/${params.id}`);
  const verdict = c.status === 'approved' ? (c.interbank ? 'перевод принят в клиринг' : 'перевод проведён') : 'перевод отклонён';
  return {
    title: `Случай № ${c.id}`,
    body: html`${crumbs([['Антифрод', '/staff/fraud'], `Случай № ${c.id}`])}
<h1>Случай № ${c.id}</h1>
<section class="tile">
  <dl class="facts">
    <div><dt>Вид перевода</dt><dd>${c.interbank ? 'В другой банк, получатель ' + c.counterparty_name : 'Клиенту банка'}</dd></div>
    <div><dt>Клиент</dt><dd>${c.login}</dd></div>
    <div><dt>Сумма</dt><dd>${formatAmount(c.amount)} ${c.currency}</dd></div>
    <div><dt>Со счёта</dt><dd>${formatIban(c.from_iban)}</dd></div>
    <div><dt>На счёт</dt><dd>${formatIban(c.to_iban)}</dd></div>
    <div><dt>Назначение</dt><dd>${c.comment || '—'}</dd></div>
    <div><dt>Балл риска</dt><dd>${c.score}</dd></div>
  </dl>
  <h2 class="mb10">Сработавшие правила</h2>
  ${c.reasons.map((r) => html`<div class="account"><div class="account__title">${r.text}</div><b>+${r.points}</b></div>`)}
</section>
${c.status === 'open' ? html`<form class="tile form w720" id="decision-form" novalidate>
  <h2>Решение</h2>
  <div class="field"><label for="comment">Комментарий (обязателен при отказе)</label><input id="comment" name="comment">${errorSlot('comment')}</div>
  ${formError()}
  <div class="actions"><button class="btn" type="submit" data-choice="approve">${c.interbank ? 'Одобрить перевод' : 'Провести перевод'}</button><button class="btn btn--ghost" type="submit" data-choice="reject">Отклонить</button></div>
</form>` : html`<div class="alert alert--info">Случай рассмотрен: ${verdict}.</div>`}`,
    mount(root) {
      bindChoiceForm(root.querySelector('#decision-form'), async (data, decision) => {
        const result = await api.post(`/staff/fraud/${params.id}`, { decision, comment: data.comment });
        flash('success', result.message);
        await navigate('/staff/fraud');
      });
    }
  };
}
