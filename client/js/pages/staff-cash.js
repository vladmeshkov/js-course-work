import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';

export default async function page({ navigate }) {
  return {
    title: 'Касса',
    body: html`<h1>Касса</h1>
<form class="tile form w640" id="cash-form" novalidate>
  ${formError()}
  <div class="field"><label for="direction">Операция</label>
    <select id="direction" name="direction"><option value="in" selected>Взнос наличных</option><option value="out">Выдача наличных</option></select>${errorSlot('direction')}</div>
  <div class="field"><label for="iban">Номер счёта клиента (IBAN)</label><input id="iban" name="iban" autocomplete="off">${errorSlot('iban')}</div>
  <div class="field"><label for="amount">Сумма (в валюте счёта)</label><input id="amount" name="amount" inputmode="decimal">${errorSlot('amount')}</div>
  <div><button class="btn btn--lg" type="submit">Провести</button></div>
</form>`,
    mount(root) {
      bindForm(root.querySelector('#cash-form'), async (data) => {
        const result = await api.post('/staff/cash', data);
        flash('success', result.message);
        await navigate('/staff/cash', { replace: true });
      });
    }
  };
}
