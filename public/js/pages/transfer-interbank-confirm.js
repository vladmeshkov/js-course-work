import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { bindForm, flash, formError, showAlert } from '../lib/ui.js';
import { formatAmount, formatIban } from '../lib/format.js';
import { demoCodeNote } from '../lib/payments-ui.js';

export default async function page({ params, navigate, refreshSession }) {
  const { transfer, demoCode } = await api.get(`/transfers/interbank/${params.id}/confirm`);
  // перевод уже не ждёт кода: возвращаем к списку переводов
  if (transfer.status !== 'pending_otp') return { redirect: '/transfers/interbank' };
  return {
    title: 'Подтверждение перевода',
    body: html`<h1>Подтвердите перевод</h1>
<form class="tile form w640" id="confirm-form" novalidate>
  <div><div class="muted2">Сумма</div><div class="balance-big balance-mid">${formatAmount(transfer.amount)} <small class="unit unit--sm">BYN</small></div></div>
  <div class="muted">Получатель: ${transfer.counterparty_name}, ${transfer.bank_name}<br>Счёт: ${formatIban(transfer.counterparty_iban)}<br>Комиссия: ${formatAmount(transfer.fee)} BYN</div>
  <div class="field"><label for="code">Код из письма</label><input id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus class="otp-input"></div>
  ${demoCodeNote(demoCode)}
  ${formError()}
  <div class="actions"><button class="btn btn--lg" type="submit">Подтвердить</button>
    <button class="link-button" type="button" id="cancel">Отменить</button></div>
</form>`,
    mount(root) {
      root.querySelector('#code')?.focus();
      bindForm(root.querySelector('#confirm-form'), async (data) => {
        const result = await api.post(`/transfers/interbank/${params.id}/confirm`, data);
        await refreshSession();
        flash('success', result.message);
        await navigate('/transfers/interbank');
      });
      const cancel = root.querySelector('#cancel');
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          const result = await api.post(`/transfers/interbank/${params.id}/cancel`);
          await refreshSession();
          flash('info', result.message);
          await navigate('/transfers/interbank');
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          cancel.disabled = false;
          showAlert(root, 'error', error.message);
        }
      });
    }
  };
}
