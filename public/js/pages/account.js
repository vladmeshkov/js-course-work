import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, flash } from '../lib/ui.js';
import { formatAmount, formatIban } from '../lib/format.js';

/** Счёт: остаток, действия и последние операции. */
export default async function page({ params, navigate }) {
  const { account, operations } = await api.get(`/accounts/${params.id}`);
  const closable = account.balance === 0 && ['current', 'savings'].includes(account.kind);
  return {
    title: account.title,
    body: html`${crumbs([['Главная', '/cabinet'], ['Счета и карты', '/accounts'], account.title])}
<section class="tile">
  <div class="muted2">${account.title}</div>
  <div class="balance-big">${formatAmount(account.balance)} <small class="muted unit">${account.currency}</small></div>
  <div class="account__iban iban-line">${formatIban(account.iban)}</div>
  <div class="actions"><a class="btn" href="/transfers/new?kind=client&from=${account.id}">Перевести</a><a class="btn btn--ghost" href="/accounts/${account.id}/statement">Выписка</a><a class="link" href="/api/accounts/${account.id}/certificate.pdf">Справка об остатке</a>
    ${closable ? html`<form id="close-form"><button class="link-button text-bad" type="submit">Закрыть счёт</button></form>` : ''}</div>
</section>
<section class="tile">
  <h2 class="mb10">Операции</h2>
  ${operations.length ? '' : html`<p class="muted m0">Операций пока нет.</p>`}
  ${operations.map((o) => html`<div class="account">
      <div>
        <div class="account__title">${o.description || o.type}</div>
        <div class="account__iban">${String(o.bank_date).slice(0, 10)}</div>
      </div>
      <div class="amount${o.signed > 0 ? ' text-good' : ''}">${o.signed > 0 ? '+' : ''}${formatAmount(o.signed)} <small>${o.currency}</small></div>
    </div>`)}
</section>`,
    mount(root) {
      bindForm(root.querySelector('#close-form'), async () => {
        const result = await api.post(`/accounts/${account.id}/close`);
        flash('success', result.message);
        await navigate('/accounts');
      });
    }
  };
}
