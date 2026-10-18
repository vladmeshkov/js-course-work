import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';

export default async function page({ navigate }) {
  const { banks } = await api.get('/staff/incoming');
  return {
    title: 'Входящие платежи',
    body: html`<h1>Входящие платежи</h1>
<form class="tile form w640" id="incoming-form" novalidate>
  <p class="muted m0">Регистрация платежа из другого банка: деньги зачисляются с корреспондентского счёта на счёт клиента.</p>
  ${formError()}
  <div class="field"><label for="bankCode">Банк отправителя</label>
    <select id="bankCode" name="bankCode">${banks.map((b) => html`<option value="${b.code}">${b.name}</option>`)}</select>${errorSlot('bankCode')}</div>
  <div class="field"><label for="name">Отправитель</label><input id="name" name="name">${errorSlot('name')}</div>
  <div class="field"><label for="iban">Счёт клиента ТалерБанка (IBAN)</label><input id="iban" name="iban" autocomplete="off">${errorSlot('iban')}</div>
  <div class="field"><label for="amount">Сумма, BYN</label><input id="amount" name="amount" inputmode="decimal">${errorSlot('amount')}</div>
  <div class="field"><label for="purpose">Назначение</label><input id="purpose" name="purpose"></div>
  <div><button class="btn btn--lg" type="submit">Зачислить</button></div>
</form>`,
    mount(root) {
      bindForm(root.querySelector('#incoming-form'), async (data) => {
        const result = await api.post('/staff/incoming', data);
        flash('success', result.message);
        await navigate('/staff/incoming', { replace: true });
      });
    }
  };
}
