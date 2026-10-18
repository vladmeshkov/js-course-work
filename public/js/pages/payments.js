import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { bindForm, crumbs, flash, showAlert } from '../lib/ui.js';
import { formatAmount } from '../lib/format.js';

export default async function page({ navigate, refreshSession }) {
  const { templates, autopayments, recent } = await api.get('/payments');
  return {
    title: 'Платежи и переводы',
    body: html`${crumbs([['Главная', '/cabinet'], 'Платежи и переводы'])}
<h1>Платежи и переводы</h1>
<section class="tiles">
  <a class="tile-link" href="/transfers/new?kind=client"><h3>Перевод клиенту банка</h3><span class="muted">По номеру счёта, с подтверждением кодом</span></a>
  <a class="tile-link" href="/transfers/new?kind=own"><h3>Между своими счетами</h3><span class="muted">Мгновенно, с конвертацией валют</span></a>
  <a class="tile-link" href="/transfers/interbank"><h3>В другой банк</h3><span class="muted">Через клиринг, отправка при закрытии дня</span></a>
  <a class="tile-link" href="/payments/catalog"><h3>Оплата услуг</h3><span class="muted">Коммунальные услуги, связь, интернет, налоги</span></a>
</section>
${templates.length ? html`<section class="tile">
  <h2 class="mb10">Шаблоны и автоплатежи</h2>
  ${templates.map((t) => {
    const auto = autopayments.find((a) => a.template_id === t.id);
    return html`<div class="account">
      <div><div class="account__title">${t.name}</div><div class="account__iban">${t.provider_name}, ${t.requisite}${auto ? html`<br>Автоплатёж ${formatAmount(auto.amount)} BYN, каждое ${auto.day_of_month}-е число, следующий ${String(auto.next_date).slice(0, 10)}${auto.last_result && auto.last_result !== 'Выполнен' ? ' (' + auto.last_result + ')' : ''}` : ''}</div></div>
      <div class="actions">
        <a class="btn btn--small" href="/payments/pay/${t.provider_id}?template=${t.id}">Оплатить</a>
        ${auto
          ? html`<button class="link-button" type="button" data-autopay-cancel="${auto.id}">Отключить автоплатёж</button>`
          : html`<form class="actions" data-autopay="${t.id}" novalidate>
            <input class="mini" name="amount" inputmode="decimal" placeholder="Сумма" aria-label="Сумма автоплатежа" value="${t.amount ? formatAmount(t.amount) : ''}">
            <input class="mini mini--day" name="day" type="number" min="1" max="28" placeholder="День" aria-label="День месяца" value="1">
            <button class="btn btn--ghost btn--small" type="submit">Автоплатёж</button></form>`}
        <button class="link-button text-bad" type="button" data-template-delete="${t.id}">Удалить</button>
      </div>
    </div>`;
  })}
</section>` : ''}
${recent.length ? html`<section class="tile">
  <h2 class="mb10">Последние платежи</h2>
  ${recent.map((p) => html`<a class="account" href="/payments/${p.id}/receipt"><div><div class="account__title">${p.provider_name}</div><div class="account__iban">${String(p.bank_date).slice(0, 10)}, ${p.requisite}${p.source === 'autopay' ? ', автоплатёж' : ''}</div></div>
      <div class="amount">−${formatAmount(p.amount + p.fee)} <small>BYN</small></div></a>`)}
</section>` : ''}`,
    mount(root) {
      // действие с последующим обновлением страницы; ошибка показывается сообщением вверху
      const act = async (button, request, type) => {
        if (button) button.disabled = true;
        try {
          const result = await request();
          await refreshSession();
          flash(type, result.message);
          await navigate('/payments', { replace: true });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          if (button) button.disabled = false;
          showAlert(root, 'error', Object.values(error.fields).join('. ') || error.message);
        }
      };
      root.querySelectorAll('[data-autopay-cancel]').forEach((button) =>
        button.addEventListener('click', () => act(button, () => api.post(`/payments/autopay/${button.dataset.autopayCancel}/cancel`), 'info')));
      root.querySelectorAll('[data-template-delete]').forEach((button) =>
        button.addEventListener('click', () => act(button, () => api.post(`/payments/templates/${button.dataset.templateDelete}/delete`), 'info')));
      root.querySelectorAll('form[data-autopay]').forEach((form) => bindForm(form, async (data) => {
        await act(null, () => api.post(`/payments/templates/${form.dataset.autopay}/autopay`, data), 'success');
      }));
    }
  };
}
