import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, formError } from '../lib/ui.js';
import { formatAmount, dmy } from '../lib/format.js';
import { accountOptions, feeNote } from '../lib/payments-ui.js';

export default async function page({ params, query, navigate, refreshSession }) {
  const { provider, icon, form, accounts, history } = await api.get(`/payments/pay/${params.providerId}`, { template: query.template });
  return {
    title: provider.name,
    body: html`${crumbs([['Главная', '/cabinet'], ['Платежи', '/payments/catalog'], [provider.category_name, `/payments/catalog/${provider.category_id}`], provider.name])}
<section class="pay-banner">
  <div><h1>${provider.name}</h1><div class="muted2">${provider.category_name}</div></div>
  <img src="/img/3d/${icon}.png" alt="">
</section>
<section class="pay-svc">
<form class="panel form pay-svc__form" id="pay-form" novalidate>
  <input type="hidden" name="providerId" value="${provider.id}">
  ${formError()}
  <div class="field"><label for="requisite">${provider.requisite_label}</label>
    <input id="requisite" name="requisite" value="${form.requisite || ''}" autocomplete="off"><span class="field__hint">${provider.requisite_hint}</span>
    ${errorSlot('requisite')}</div>
  <div class="field"><label for="amount">Сумма, BYN</label>
    <input id="amount" name="amount" value="${form.amount || ''}" inputmode="decimal" autocomplete="off">
    <span class="field__hint">От ${formatAmount(provider.min_amount)} до ${formatAmount(provider.max_amount)}${Number(provider.fee_percent) > 0 ? feeNote(provider.fee_percent) : ', без комиссии'}</span>
    ${errorSlot('amount')}</div>
  <div class="field"><label for="fromAccountId">Со счёта</label>
    <select id="fromAccountId" name="fromAccountId">${accountOptions(accounts, form.fromAccountId)}</select>
    ${errorSlot('fromAccountId')}</div>
  <label class="check"><input type="checkbox" name="saveTemplate"> Сохранить как шаблон</label>
  <div class="field"><label for="templateName">Название шаблона</label><input id="templateName" name="templateName" placeholder="Например, Квартира"></div>
  <label class="check"><input type="checkbox" name="saveAmount"> Запомнить сумму в шаблоне</label>
  <div><button class="btn btn--lg" type="submit">Оплатить</button></div>
</form>
<aside class="panel pay-svc__hist">
  <h2>Прошлые платежи</h2>
  ${history.length ? '' : html`<p class="muted m0">Платежей этому получателю ещё не было.</p>`}
  ${history.map((h) => html`<a class="hist-row" href="/payments/${h.id}/receipt"><span class="muted">${dmy(h.bank_date)}</span><b>${formatAmount(h.amount + h.fee)} BYN</b></a>`)}
</aside>
</section>`,
    mount(root) {
      bindForm(root.querySelector('#pay-form'), async (data) => {
        const result = await api.post('/payments/pay', data);
        await refreshSession();
        await navigate(`/payments/${result.id}/receipt`);
      });
    }
  };
}
