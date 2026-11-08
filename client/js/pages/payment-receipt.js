import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindPrint } from '../lib/ui.js';
import { formatAmount, formatIban, dmy } from '../lib/format.js';

export default async function page({ params }) {
  const { r } = await api.get(`/payments/${params.id}/receipt`);
  return {
    title: `Квитанция № ${r.id}`,
    body: html`<nav class="crumbs no-print" aria-label="Навигационная цепочка"><a href="/payments">Платежи и переводы</a> &nbsp;›&nbsp; Квитанция</nav>
<section class="pay-done">
  <aside class="talon talon--paid">
    <div class="talon__edge talon__edge--top"></div>
    <div class="talon__body">
      <div class="talon__head"><img src="/img/emblem.png" alt="" width="30" height="30"><span>Квитанция об оплате № ${r.id} от ${dmy(r.bank_date)}</span></div>
      <div class="talon__sum">${formatAmount(r.amount + r.fee)} <small>BYN</small></div>
      <div class="talon__ok">Платёж выполнен</div>
      <div class="talon__cut"></div>
      <dl class="talon__rows">
        <div><dt class="muted">Получатель</dt><dd>${r.provider_name}</dd></div>
        <div><dt class="muted">Категория</dt><dd>${r.category_name}</dd></div>
        <div><dt class="muted">${r.requisite_label}</dt><dd>${r.requisite}</dd></div>
        <div><dt class="muted">Со счёта</dt><dd>${formatIban(r.iban)}</dd></div>
        <div><dt class="muted">Сумма</dt><dd>${formatAmount(r.amount)} BYN</dd></div>
        <div><dt class="muted">Комиссия</dt><dd>${formatAmount(r.fee)} BYN</dd></div>
      </dl>
      <div class="actions no-print"><button class="btn" type="button" data-print>Распечатать</button><a class="btn btn--ghost" href="/api/payments/${r.id}/receipt.pdf">PDF</a><a class="link" href="/payments">Ещё платёж</a></div>
    </div>
    <div class="talon__edge talon__edge--bottom"></div>
  </aside>
</section>`,
    mount(root) {
      bindPrint(root);
    }
  };
}
