import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, flash, formError } from '../lib/ui.js';
import { accountOptions } from '../lib/payments-ui.js';

export default async function page({ query, navigate, refreshSession }) {
  const { kind, accounts, fromAccountId } = await api.get('/transfers/new', { kind: query.kind, from: query.from });
  const own = kind === 'own';
  const current = (accounts.find((a) => String(a.id) === String(fromAccountId)) || accounts[0] || {}).currency || 'BYN';
  return {
    title: 'Перевод',
    body: html`${crumbs([['Главная', '/cabinet'], ['Платежи и переводы', '/payments'], 'Перевод'])}
<section class="panel xfer">
<h1 class="xfer__title">${own ? 'Перевод между своими счетами' : 'Перевод клиенту банка онлайн'}</h1>
<div class="xfer__perks">
  ${own ? html`<span>Мгновенно</span><span>Конвертация по курсу банка</span><span>Без комиссии</span>`
    : html`<span>По номеру счёта в формате IBAN</span><span>Без комиссии внутри банка</span><span>Подтверждение кодом</span>`}
</div>
<div class="chips chips--center" role="tablist">
  <a class="chip" role="tab" aria-selected="${String(!own)}" href="/transfers/new?kind=client">Клиенту банка</a>
  <a class="chip" role="tab" aria-selected="${String(own)}" href="/transfers/new?kind=own">Между своими счетами</a>
  <a class="chip" role="tab" aria-selected="false" href="/transfers/interbank">В другой банк</a>
</div>
<form class="xfer__form" id="transfer-form" novalidate>
  <input type="hidden" name="kind" value="${kind}">
  ${formError()}
  <div class="xfer__pair">
    <div class="xfer__side">
      <div><div class="xfer__h">Со счёта</div><div class="muted2">ТалерБанк</div></div>
      <div class="xfer__box">
        <label for="fromAccountId">Счёт списания</label>
        <select id="fromAccountId" name="fromAccountId">${accountOptions(accounts, fromAccountId, { withCurrency: true })}</select>
      </div>
      ${errorSlot('fromAccountId')}
    </div>
    <div class="xfer__side">
      ${own ? html`
        <div><div class="xfer__h">На счёт</div><div class="muted2">Свой счёт в ТалерБанке</div></div>
        <div class="xfer__box">
          <label for="toAccountId">Счёт зачисления</label>
          <select id="toAccountId" name="toAccountId">${accountOptions(accounts, null, { withCurrency: true })}</select>
        </div>
        ${errorSlot('toAccountId')}
        <div class="xfer__hint">Если валюты разные, сумма пересчитается по курсу банка.</div>`
      : html`
        <div><div class="xfer__h">На счёт</div><div class="muted2">Клиента ТалерБанка</div></div>
        <div class="xfer__box">
          <label for="toIban">Номер счёта (IBAN)</label>
          <input id="toIban" name="toIban" autocomplete="off" placeholder="BY00 TLRB 2400 0000 0000 0000 0001">
        </div>
        ${errorSlot('toIban')}`}
    </div>
  </div>
  <div class="xfer__row">
    <div class="xfer__box xfer__box--sum">
      <label for="amount">Сумма (в валюте счёта списания)</label>
      <input id="amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00">
    </div>
    <div class="xfer__box xfer__box--cur"><div class="xfer__curlabel">Валюта</div><div class="xfer__curval" id="xfer-cur">${current}</div></div>
    <div class="xfer__box xfer__box--comment">
      <label for="comment">Назначение платежа</label>
      <input id="comment" name="comment" maxlength="140">
    </div>
  </div>
  ${errorSlot('amount')}
  <div class="xfer__foot">
    <p class="xfer__note">Комиссия и лимит показаны на следующем шаге. Операция подтверждается одноразовым кодом. Если зачисление не удастся, деньги останутся на вашем счёте.</p>
    <button class="btn btn--lg xfer__go" type="submit">Перевести</button>
  </div>
</form>
</section>`,
    mount(root) {
      // валюта списания рядом с суммой следует за выбранным счётом
      const select = root.querySelector('#fromAccountId');
      const cur = root.querySelector('#xfer-cur');
      const sync = () => {
        const option = select?.options[select.selectedIndex];
        if (option?.dataset.currency) cur.textContent = option.dataset.currency;
      };
      select?.addEventListener('change', sync);
      sync();

      bindForm(root.querySelector('#transfer-form'), async (data) => {
        const result = await api.post('/transfers', data);
        await refreshSession();
        if (result.review) {
          flash('info', 'Перевод принят и находится на проверке в банке. Мы сообщим о результате, деньги на счёте зарезервированы.');
          return navigate(`/accounts/${result.fromAccountId}`);
        }
        if (result.executed) {
          flash('success', 'Перевод выполнен');
          return navigate(`/accounts/${result.fromAccountId}`);
        }
        if (result.sentTo) flash('info', `Код подтверждения отправлен на почту ${result.sentTo}`);
        return navigate(`/transfers/${result.id}/confirm`);
      });
    }
  };
}
