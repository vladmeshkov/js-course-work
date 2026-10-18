import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, flash, formError } from '../lib/ui.js';
import { flag } from '../lib/flags.js';

const CURRENCIES = [['BYN', 'Белорусский рубль', 'byn'], ['USD', 'Доллар США', 'usd'], ['EUR', 'Евро', 'eur'], ['RUB', 'Российский рубль', 'rub'], ['CNY', 'Китайский юань', 'cny']];
const NOTES = {
  current: 'Текущий счёт нужен для платежей, переводов и карт.',
  savings: 'Накопительный счёт нужен для откладывания денег: платежи и карты к нему не привязываются.'
};

/** Открытие счёта: валюта, вид счёта и талон с реквизитами. */
export default async function page({ navigate }) {
  return {
    title: 'Открыть счёт',
    body: html`${crumbs([['Главная', '/cabinet'], ['Счета и карты', '/accounts'], 'Открыть счёт'])}
<h1>Открыть счёт</h1>
<form class="acc-new" id="acc-form" novalidate>
  ${formError()}
  <fieldset class="acc-new__block">
    <legend>В какой валюте</legend>
    <div class="cur-cards">
      ${CURRENCIES.map(([c, n, code]) => html`<label class="cur-card"><input type="radio" name="currency" value="${c}"${c === 'BYN' ? ' checked' : ''}>
          <span class="cur-card__in">${flag(code, 44)}<span><b>${c}</b><small>${n}</small></span></span></label>`)}
    </div>
    ${errorSlot('currency')}
  </fieldset>
  <fieldset class="acc-new__block">
    <legend>Какой счёт</legend>
    <div class="chips">
      <label class="chip-radio"><input type="radio" name="kind" value="current" checked><span>Текущий</span></label>
      <label class="chip-radio"><input type="radio" name="kind" value="savings"><span>Накопительный</span></label>
    </div>
    <p class="muted acc-new__note" id="kind-note">${NOTES.current}</p>
    ${errorSlot('kind')}
  </fieldset>
  <section class="talon-wide">
    <div class="talon-wide__top">
      <div class="talon-wide__who"><img src="/img/emblem.png" alt="" width="44" height="44"><span class="muted2">Реквизиты нового счёта</span></div>
      <span class="talon-wide__st">Номер присваивается при открытии</span>
    </div>
    <div class="talon-wide__iban" aria-label="Номер счёта появится после открытия">BY•• TLRB 2400 •••• •••• •••• ••••</div>
    <div class="talon-wide__cut"></div>
    <div class="talon-wide__bottom">
      <div class="talon-wide__facts">
        <div><small>Валюта</small><b id="acc-cur">BYN</b></div>
        <div><small>Формат номера</small><b>IBAN Беларуси, mod 97</b></div>
        <div><small>Обслуживание</small><b>0 BYN</b></div>
      </div>
      <button class="btn btn--lg" type="submit">Открыть счёт</button>
    </div>
  </section>
</form>`,
    mount(root) {
      const form = root.querySelector('#acc-form');
      const cur = root.querySelector('#acc-cur');
      const note = root.querySelector('#kind-note');
      // выбранная валюта попадает на талон, к виду счёта показывается пояснение
      form.addEventListener('change', (event) => {
        if (event.target.name === 'currency') cur.textContent = event.target.value;
        if (event.target.name === 'kind') note.textContent = NOTES[event.target.value];
      });
      bindForm(form, async (data) => {
        const result = await api.post('/accounts', data);
        flash('success', result.message);
        await navigate(`/accounts/${result.id}`);
      });
    }
  };
}
