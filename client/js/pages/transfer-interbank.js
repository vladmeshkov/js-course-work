import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, flash, formError, showAlert } from '../lib/ui.js';
import { formatAmount } from '../lib/format.js';
import { accountOptions } from '../lib/payments-ui.js';

const STATUS_NAMES = { pending_otp: 'ждёт подтверждения', review: 'на проверке в банке', queued: 'в очереди клиринга', sent: 'отправлен', rejected: 'отклонён', cancelled: 'отменён' };

export default async function page({ navigate, refreshSession }) {
  const { accounts, banks, history } = await api.get('/transfers/interbank');
  return {
    title: 'Перевод в другой банк',
    body: html`${crumbs([['Главная', '/cabinet'], ['Платежи и переводы', '/payments'], 'В другой банк'])}
<h1>Перевод в другой банк</h1>
<div class="chips" role="tablist">
  <a class="chip" role="tab" aria-selected="false" href="/transfers/new?kind=client">Клиенту банка</a>
  <a class="chip" role="tab" aria-selected="false" href="/transfers/new?kind=own">Между своими счетами</a>
  <a class="chip" role="tab" aria-selected="true" href="/transfers/interbank">В другой банк</a>
</div>
<form class="tile form w720" id="interbank-form" novalidate>
  ${formError()}
  <div class="field"><label for="fromAccountId">Со счёта</label>
    <select id="fromAccountId" name="fromAccountId">${accountOptions(accounts, null)}</select>
    ${errorSlot('fromAccountId')}</div>
  <div class="field"><label for="name">Получатель</label><input id="name" name="name" autocomplete="off">${errorSlot('name')}</div>
  <div class="field"><label for="iban">Номер счёта получателя (IBAN)</label><input id="iban" name="iban" autocomplete="off" placeholder="BY00 DRZH 2400 0000 0000 0000 0001">
    <span class="field__hint">Банк определяется по символам 5-8 номера: ${banks.filter((b) => b.active).map((b) => `${b.name} (${b.code})`).join(', ')}</span>
    ${errorSlot('iban')}</div>
  <div class="field"><label for="amount">Сумма, BYN</label><input id="amount" name="amount" inputmode="decimal" autocomplete="off"><span class="field__hint">Комиссия 0,5%, не меньше 0,50 BYN. Платёж уйдёт в банк получателя при закрытии операционного дня.</span>${errorSlot('amount')}</div>
  <div class="field"><label for="purpose">Назначение платежа</label><input id="purpose" name="purpose" maxlength="140"></div>
  <div><button class="btn btn--lg" type="submit">Продолжить</button></div>
</form>
<section class="tile">
  <h2 class="mb10">Мои переводы в другие банки</h2>
  ${history.length ? '' : html`<p class="muted m0">Переводов пока нет.</p>`}
  ${history.map((t) => html`<div class="account">
      <div><div class="account__title">${t.counterparty_name}, ${t.bank_name}</div><div class="account__iban">${STATUS_NAMES[t.status]}${t.reject_reason ? ': ' + t.reject_reason : ''}</div></div>
      <div class="actions"><div class="amount">${formatAmount(t.amount)} <small>BYN</small></div>
        ${['queued', 'pending_otp'].includes(t.status) ? html`<button class="link-button text-bad" type="button" data-cancel="${t.id}">Отменить</button>` : ''}</div>
    </div>`)}
</section>`,
    mount(root) {
      bindForm(root.querySelector('#interbank-form'), async (data) => {
        const result = await api.post('/transfers/interbank', data);
        await refreshSession();
        if (result.sentTo) flash('info', `Код подтверждения отправлен на почту ${result.sentTo}`);
        return navigate(`/transfers/interbank/${result.id}/confirm`);
      });
      root.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await api.post(`/transfers/interbank/${button.dataset.cancel}/cancel`);
          await refreshSession();
          flash('info', result.message);
          await navigate('/transfers/interbank', { replace: true });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          button.disabled = false;
          showAlert(root, 'error', error.message);
        }
      }));
    }
  };
}
