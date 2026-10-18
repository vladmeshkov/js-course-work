import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, flash, formError } from '../lib/ui.js';
import { formatAmount, formatIban } from '../lib/format.js';
import { cardClass, cardFace } from '../lib/accounts-cards.js';

/** Поле суммы лимита с местом под ошибку. */
const limitField = (name, label, value) => html`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" inputmode="decimal" value="${formatAmount(value)}">${errorSlot(name)}</div>`;

/** Карточка карты: статус, лимиты, имитация покупки и операции. Номер и CVV показываются один раз после выпуска. */
export default async function page({ params, navigate }) {
  const { card, operations, systems, secret, cards } = await api.get(`/cards/${params.id}`);
  const active = card.status === 'active';
  return {
    title: `Карта *${card.last4}`,
    body: html`${crumbs([['Главная', '/cabinet'], ['Счета и карты', '/accounts'], 'Карты'])}
${secret ? html`<div class="alert alert--info" role="status">
  <b>Сохраните данные карты, больше они показаны не будут.</b><br>
  Номер: <b>${secret.number.replace(/(.{4})/g, '$1 ').trim()}</b>, срок ${card.expires}, CVV <b>${secret.cvv}</b>
</div>` : ''}
<h1>Мои карты</h1>
<section class="card-pick" aria-label="Выбор карты">
  ${cards.map((c) => html`<a class="card-pick__item${c.id === card.id ? ' is-active' : ''}" href="/cards/${c.id}"${c.id === card.id ? ' aria-current="true"' : ''}>
      <span class="${cardClass(c)}">${cardFace(c, systems)}</span>
    </a>`)}
</section>
<section class="row">
  <div class="panel grow-2">
    <div class="card-status"><h2>Карта ${systems[card.system]} •••• ${card.last4}</h2><span class="card-status__badge card-status__badge--${active ? 'ok' : 'bad'}">${active ? 'Активна' : 'Заблокирована'}</span></div>
    <div class="muted2">Счёт карты</div>
    <div class="account__title">${card.account_title}</div>
    <div class="account__iban mb14">${formatIban(card.iban)}</div>
    <div class="actions">
      <form id="block-form"><input type="hidden" name="action" value="${active ? 'block' : 'unblock'}">
        ${active ? html`<button class="btn btn--ghost text-bad" type="submit">Заблокировать</button>` : html`<button class="btn" type="submit">Разблокировать</button>`}</form>
      <form id="close-form"><button class="link-button" type="submit">Закрыть карту</button></form>
    </div>
  </div>
</section>
<section class="row">
  <aside class="dark-tile grow">
    <div class="dark-tile__lead">Суточный лимит</div>
    <div class="dark-tile__big">${formatAmount(card.daily_limit)} <small>${card.currency}</small></div>
    <div class="dark-tile__facts">
      <div><span>На одну операцию</span><b>${formatAmount(card.per_op_limit)}</b></div>
      <div><span>В месяц</span><b>${formatAmount(card.monthly_limit)}</b></div>
    </div>
    <p class="dark-tile__note">Изменить лимиты можно в форме рядом.</p>
  </aside>
  <form class="panel form grow" id="limits-form" novalidate>
    <h2>Лимиты</h2>
    ${formError()}
    ${limitField('perOp', `На одну операцию, ${card.currency}`, card.per_op_limit)}
    ${limitField('daily', `В сутки, ${card.currency}`, card.daily_limit)}
    ${limitField('monthly', `В месяц, ${card.currency}`, card.monthly_limit)}
    <label class="switch-row"><span><b>Онлайн-покупки</b><small>Оплата в интернете с подтверждением 3-D Secure</small></span><span class="switch"><input type="checkbox" name="online" role="switch"${card.online_enabled ? ' checked' : ''}><i></i></span></label>
    <div><button class="btn btn--ghost" type="submit">Сохранить</button></div>
  </form>
  <form class="panel form grow" id="purchase-form" novalidate>
    <h2>Оплатить картой</h2>
    <p class="muted2 m0 small">Учебная имитация терминала: проверяются статус, лимиты и разрешение интернет-платежей.</p>
    ${formError()}
    <div class="field"><label for="place">Где</label><input id="place" name="place" value="Магазин «Евроопт»">${errorSlot('place')}</div>
    <div class="field"><label for="amount">Сумма, ${card.currency}</label><input id="amount" name="amount" inputmode="decimal">${errorSlot('amount')}</div>
    <label class="check"><input type="checkbox" name="online"> Оплата в интернете</label>
    <div><button class="btn" type="submit">Оплатить</button></div>
  </form>
</section>
<section class="panel">
  <h2 class="mb10">Операции по карте</h2>
  ${operations.length ? '' : html`<p class="muted m0">Операций пока нет.</p>`}
  ${operations.map((o) => html`<div class="account"><div><div class="account__title">${o.place || 'Покупка'}</div><div class="account__iban">${String(o.bank_date).slice(0, 10)}${o.online ? ', интернет' : ''}</div></div>
      <div class="amount">−${formatAmount(o.amount)} <small>${card.currency}</small></div></div>`)}
</section>
<section class="panel new-card">
  <div><h2>Выпустить новую карту</h2><p class="muted m0">Привяжем к вашему текущему счёту. Номер и CVV будут показаны один раз сразу после выпуска.</p></div>
  <a class="btn btn--lg" href="/cards/new">Заказать карту</a>
</section>`,
    mount(root) {
      // после действия страница карты перерисовывается с новыми данными и сообщением
      const reload = async (result) => {
        flash('success', result.message);
        await navigate(`/cards/${card.id}`, { replace: true });
      };
      bindForm(root.querySelector('#block-form'), async (data) => reload(await api.post(`/cards/${card.id}/block`, data)));
      bindForm(root.querySelector('#close-form'), async () => {
        const result = await api.post(`/cards/${card.id}/close`);
        flash('success', result.message);
        await navigate('/cards');
      });
      bindForm(root.querySelector('#limits-form'), async (data) => reload(await api.post(`/cards/${card.id}/limits`, data)));
      bindForm(root.querySelector('#purchase-form'), async (data) => reload(await api.post(`/cards/${card.id}/purchase`, data)));
    }
  };
}
