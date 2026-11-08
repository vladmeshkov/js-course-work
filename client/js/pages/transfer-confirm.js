import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { bindForm, flash, formError, showAlert } from '../lib/ui.js';
import { formatAmount, formatIban } from '../lib/format.js';
import { demoCodeNote } from '../lib/payments-ui.js';

export default async function page({ params, navigate, refreshSession }) {
  const { intent, from, to, demoCode } = await api.get(`/transfers/${params.id}/confirm`);
  // перевод уже обработан: показывать код нечего, открываем счёт
  if (intent.status !== 'new') return { redirect: `/accounts/${intent.fromAccountId}` };
  return {
    title: 'Подтверждение перевода',
    body: html`<h1>Подтвердите перевод</h1>
<form class="tile form w640" id="confirm-form" novalidate>
  <div>
    <div class="muted2">Сумма</div>
    <div class="balance-big balance-mid">${formatAmount(intent.amount)} <small class="muted unit unit--sm">${from.currency}</small></div>
  </div>
  <div class="muted">Со счёта: ${formatIban(from.iban)}<br>На счёт: ${formatIban(to.iban)}${intent.fee > 0 ? html`<br>Комиссия: ${formatAmount(intent.fee)} ${from.currency}` : ''}</div>
  <div class="field">
    <label for="code">Код из письма</label>
    <input class="otp-input" id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus>
  </div>
  ${demoCodeNote(demoCode)}
  ${formError()}
  <div class="actions">
    <button class="btn btn--lg" type="submit">Подтвердить</button>
    <button class="link link-button" type="button" id="cancel">Отменить</button>
  </div>
</form>`,
    mount(root) {
      root.querySelector('#code')?.focus();
      bindForm(root.querySelector('#confirm-form'), async (data) => {
        const result = await api.post(`/transfers/${params.id}/confirm`, data);
        await refreshSession();
        flash('success', result.message);
        await navigate(`/accounts/${result.fromAccountId}`);
      });
      const cancel = root.querySelector('#cancel');
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          const result = await api.post(`/transfers/${params.id}/cancel`);
          flash('info', result.message);
          await navigate('/transfers/new');
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          cancel.disabled = false;
          showAlert(root, 'error', error.message);
        }
      });
    }
  };
}
