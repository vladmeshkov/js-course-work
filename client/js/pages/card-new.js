import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, flash, formError } from '../lib/ui.js';
import { formatAmount } from '../lib/format.js';

/** Выпуск карты: платёжная система, счёт и PIN-код. */
export default async function page({ navigate }) {
  const { accounts, systems } = await api.get('/cards/new');
  return {
    title: 'Выпустить карту',
    body: html`${crumbs([['Главная', '/cabinet'], ['Карты', '/cards'], 'Выпуск'])}
<h1>Выпустить карту</h1>
<form class="tile form w640" id="card-form" novalidate>
  ${formError()}
  <div class="field"><label for="system">Платёжная система</label>
    <select id="system" name="system">${Object.entries(systems).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select>
    ${errorSlot('system')}</div>
  <div class="field"><label for="accountId">Привязать к счёту</label>
    <select id="accountId" name="accountId">${accounts.map((a) => html`<option value="${a.id}">${a.title}, ${formatAmount(a.balance)} ${a.currency}</option>`)}</select>
    ${errorSlot('accountId')}</div>
  <div class="field"><label for="pin">PIN-код (4 цифры)</label>
    <input id="pin" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">${errorSlot('pin')}</div>
  <p class="muted2 m0 small">Номер карты и CVV будут показаны один раз после выпуска. В базе хранится только зашифрованный номер и хэши PIN и CVV.</p>
  <div><button class="btn btn--lg" type="submit">Выпустить</button></div>
</form>`,
    mount(root) {
      bindForm(root.querySelector('#card-form'), async (data, form) => {
        form.elements.pin.value = '';
        const result = await api.post('/cards', data);
        await navigate(`/cards/${result.id}`);
      });
    }
  };
}
