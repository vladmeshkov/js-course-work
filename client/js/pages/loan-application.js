import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs, bindForm, formError, flash, showAlert } from '../lib/ui.js';
import { formatAmount, percent } from '../lib/format.js';

const ALERT_TYPE = { rejected: 'error', manual_review: 'info' };

function statusText(a) {
  if (a.status === 'approved') return 'Кредит одобрен. Подпишите договор, чтобы получить деньги.';
  if (a.status === 'manual_review') return 'Заявка передана кредитному специалисту. Решение появится здесь.';
  if (a.status === 'rejected') return `Отказ${a.decision_comment ? `: ${a.decision_comment}` : ''}.`;
  return 'Договор подписан, кредит выдан.';
}

/** Заявка клиента: решение по скорингу, условия, подписание договора кодом и пояснение балла. */
export default async function page({ params, navigate }) {
  const { application: a, demoCode } = await api.get(`/loans/applications/${params.id}`);
  const approved = a.status === 'approved';
  return {
    title: `Заявка № ${a.id}`,
    body: html`${crumbs([['Главная', '/'], ['Кредиты', '/loans'], `Заявка № ${a.id}`])}
<h1>Заявка № ${a.id}</h1>
<section class="tile">
  <div class="alert alert--${ALERT_TYPE[a.status] ?? 'success'}" role="status">${statusText(a)}</div>
  <dl class="facts">
    <div><dt>Кредит</dt><dd>${a.product_name}</dd></div>
    <div><dt>Сумма</dt><dd>${formatAmount(a.amount)} BYN</dd></div>
    <div><dt>Срок</dt><dd>${a.term_months} мес.</dd></div>
    <div><dt>Ставка</dt><dd>${percent(a.rate_percent)}% годовых</dd></div>
    <div><dt>Платежи</dt><dd>${a.schedule_type === 'annuity' ? 'аннуитетные' : 'дифференцированные'}</dd></div>
    <div><dt>Первый платёж</dt><dd>${formatAmount(a.first_payment)} BYN</dd></div>
    <div><dt>Долговая нагрузка</dt><dd>${percent(a.dti_percent)}%</dd></div>
    <div><dt>Скоринговый балл</dt><dd>${a.score} из 100</dd></div>
  </dl>
  ${approved ? html`<p class="muted measure">Условия на одной странице: сумма ${formatAmount(a.amount)} BYN, ставка ${percent(a.rate_percent)}% годовых, срок ${a.term_months} мес., первый платёж ${formatAmount(a.first_payment)} BYN. Платежи списываются со счёта зачисления в дату платежа. Договор подписывается кодом из письма.</p>
    <form class="form w420" id="sign-form" novalidate>
      <div class="field"><label for="code">Код из письма</label><input class="otp-input" id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      <div class="alert alert--info" id="demo-box"${demoCode ? '' : html` hidden`}>Учебная версия: код вместо письма: <b id="demo-code">${demoCode}</b></div>
      ${formError()}
      <div class="actions">
        <button class="btn" type="submit">Подписать договор</button>
        <button class="btn btn--ghost" type="button" id="get-code">Получить код</button>
      </div>
    </form>` : ''}
</section>
<section class="tile">
  <h2 class="mb10">Как посчитан балл</h2>
  ${a.scoring_notes.map((n) => html`<div class="account"><div class="account__title">${n.factor}</div><div><span class="muted2">${n.text}</span> &nbsp; <b>${n.points}</b></div></div>`)}
</section>`,
    mount(root) {
      const form = root.querySelector('#sign-form');
      if (!form) return;
      const demoBox = root.querySelector('#demo-box');
      const demoText = root.querySelector('#demo-code');
      const button = root.querySelector('#get-code');

      button.addEventListener('click', async () => {
        button.classList.add('is-loading');
        try {
          const result = await api.post(`/loans/applications/${a.id}/code`);
          if (result.sentTo) {
            demoBox.hidden = true;
            showAlert(root, 'info', `Код подписания отправлен на почту ${result.sentTo}`);
          } else {
            if (result.demoCode) {
              demoText.textContent = result.demoCode;
              demoBox.hidden = false;
            }
            showAlert(root, 'info', 'Код сформирован. В учебной версии он показан на странице');
          }
        } catch (error) {
          showAlert(root, 'error', error.message);
        } finally {
          button.classList.remove('is-loading');
        }
      });

      bindForm(form, async (data) => {
        const result = await api.post(`/loans/applications/${a.id}/sign`, data);
        flash('success', 'Договор подписан, деньги зачислены на счёт');
        await navigate(`/loans/${result.id}`);
      });
    }
  };
}
