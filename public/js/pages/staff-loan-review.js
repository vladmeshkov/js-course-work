import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';
import { formatAmount, dmy, percent } from '../lib/format.js';

/** Анкета заёмщика, проверки скоринга и решение кредитного специалиста. */
export default async function page({ params, navigate }) {
  const { application: a } = await api.get(`/staff/loans/${params.id}`);
  const sections = [
    ['Заёмщик', [['ФИО', `${a.last_name} ${a.first_name} ${a.patronymic || ''}`], ['Дата рождения', dmy(a.birth_date)]]],
    ['Кредит', [['Продукт', a.product_name], ['Сумма', `${formatAmount(a.amount)} BYN`], ['Срок', `${a.term_months} мес.`], ['Первый платёж', `${formatAmount(a.first_payment)} BYN`]]],
    ['Доходы и обязательства', [['Доход в месяц', `${formatAmount(a.income)} BYN`], ['Платежи по другим кредитам', `${formatAmount(a.obligations)} BYN`], ['Стаж', `${a.experience_months} мес.`], ['Иждивенцы', String(a.dependents)], ['Долговая нагрузка', `${percent(a.dti_percent)}%`]]]
  ];
  const stamp = a.status === 'approved' || a.status === 'signed' ? ['ОДОБРЕНО', 'ok'] : a.status === 'rejected' ? ['ОТКАЗ', 'bad'] : null;
  const points = (n) => `${n.points > 0 ? '+' : ''}${String(n.points).replace('.', ',')} п.п.`;
  return {
    title: `Заявка № ${a.id}`,
    body: html`<nav class="crumbs" aria-label="Навигационная цепочка"><a href="/staff/loans">Заявки на кредит</a> &nbsp;›&nbsp; № ${a.id}</nav>
<section class="review">
  <article class="paper" aria-label="Анкета заёмщика">
    <div class="paper__head"><h1>Анкета заёмщика</h1><span class="muted">№ ${a.id}</span></div>
    ${sections.map((sec) => html`<div class="paper__sec">
        <h3>${sec[0]}</h3>
        ${sec[1].map((r) => html`<div class="dots"><span class="muted">${r[0]}</span><i></i><b>${r[1]}</b></div>`)}
      </div>`)}
    ${stamp ? html`<div class="paper__stamp paper__stamp--${stamp[1]}">${stamp[0]}</div>` : ''}
  </article>
  <aside class="review__side">
    <div>
      <h2>Проверки</h2>
      ${a.model_version ? html`<div class="check-row"><span>Вероятность дефолта<small>регрессионная модель версии ${a.model_version}</small></span><b>${percent(a.pd_percent)} %</b></div>
        ${a.scoring_notes.slice(1).map((n) => html`<div class="check-row"><span>${n.factor}<small>${n.text}</small></span><b class="${n.points > 0 ? 'text-bad' : n.points < 0 ? 'text-good' : ''}">${points(n)}</b></div>`)}
        <p class="muted2 small m0">Вклад признака: на сколько процентных пунктов он меняет вероятность дефолта относительно среднего заёмщика.</p>`
      : html`<div class="check-row"><span>Скоринговый балл</span><b>${a.score} из 100</b></div>
        ${a.scoring_notes.map((n) => html`<div class="check-row"><span>${n.factor}<small>${n.text}</small></span><b>${n.points}</b></div>`)}`}
    </div>
    ${a.status === 'manual_review' ? html`<form class="panel form" id="decision-form" novalidate>
      <h2>Решение</h2>
      <div class="field"><label for="comment">Комментарий (обязателен при отказе)</label><textarea id="comment" name="comment" rows="3"></textarea>${errorSlot('comment')}</div>
      ${formError()}
      <div class="actions actions--tight"><button class="btn" type="submit" data-decision="approve">Одобрить</button><button class="btn btn--ghost btn--danger" type="submit" data-decision="reject">Отказать</button></div>
    </form>` : html`<div class="alert alert--info">Заявка уже рассмотрена.</div>`}
  </aside>
</section>`,
    mount(root) {
      const form = root.querySelector('#decision-form');
      if (!form) return;
      // какая из двух кнопок нажата: значение решения берётся из неё (click срабатывает раньше submit)
      let decision = '';
      form.querySelectorAll('[data-decision]').forEach((b) => b.addEventListener('click', () => { decision = b.dataset.decision; }));
      bindForm(form, async (data) => {
        const result = await api.post(`/staff/loans/${a.id}`, { ...data, decision });
        flash('success', result.status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена');
        await navigate('/staff/loans');
      });
    }
  };
}
