import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs, errorSlot, formError, flash } from '../lib/ui.js';
import { bindChoiceForm } from '../lib/staff-choice.js';

export default async function page({ params, navigate }) {
  const { client } = await api.get(`/staff/kyc/${params.id}`);
  return {
    title: `Анкета ${client.lastName}`,
    body: html`${crumbs([['Анкеты клиентов', '/staff/kyc'], client.lastName])}
<h1>${client.lastName} ${client.firstName} ${client.patronymic || ''}</h1>
<section class="tile">
  <dl class="facts">
    <div><dt>Логин</dt><dd>${client.login}</dd></div>
    <div><dt>Дата рождения</dt><dd>${String(client.birthDate).slice(0, 10)}</dd></div>
    <div><dt>Телефон</dt><dd>${client.phone}</dd></div>
    <div><dt>Почта</dt><dd>${client.email || '—'}</dd></div>
    <div><dt>Идентификационный номер</dt><dd>${client.idNumber}</dd></div>
    <div><dt>Паспорт</dt><dd>${client.passport}</dd></div>
  </dl>
  <p class="muted2 small m0">Данные хранятся зашифрованными, факт просмотра записан в журнал аудита.</p>
</section>
${client.kycStatus === 'submitted' ? html`<form class="tile form w720" id="decision-form" novalidate>
  <h2>Решение</h2>
  <div class="field"><label for="comment">Комментарий (обязателен при отказе)</label><input id="comment" name="comment">${errorSlot('comment')}</div>
  ${formError()}
  <div class="actions"><button class="btn" type="submit" data-choice="approve">Подтвердить и открыть счёт</button><button class="btn btn--ghost" type="submit" data-choice="reject">Отклонить</button></div>
</form>` : html`<div class="alert alert--info">Анкета уже рассмотрена.</div>`}`,
    mount(root) {
      bindChoiceForm(root.querySelector('#decision-form'), async (data, decision) => {
        const result = await api.post(`/staff/kyc/${params.id}`, { decision, comment: data.comment });
        flash('success', result.message);
        await navigate('/staff/kyc');
      });
    }
  };
}
