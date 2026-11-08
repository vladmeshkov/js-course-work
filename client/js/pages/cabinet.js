import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatAmount, formatIban, dmy, percent } from '../lib/format.js';

export default async function page() {
  const d = await api.get('/cabinet');
  const { client } = d;
  if (client && client.kyc_status !== 'verified') {
    return {
      title: 'Главная',
      body: html`<h1>Здравствуйте, ${client.first_name}</h1>
  <div class="alert alert--info" role="status">
    ${client.kyc_status === 'rejected'
      ? `Заявка отклонена${client.kyc_comment ? ': ' + client.kyc_comment : ''}. Обратитесь в отделение банка.`
      : 'Ваша заявка на проверке. Счёт откроется после подтверждения анкеты сотрудником банка.'}
  </div>`
    };
  }
  const { accounts, totalByn, nextPayment, cards, deposits, loans, operations, rates, maxDepositRate, minLoanRate } = d;
  const [whole, cents] = formatAmount(totalByn).split(',');
  return {
    title: 'Главная',
    body: html`<section class="overview">
  <div class="overview__main">
    <p class="overview__hello m0">Здравствуйте, ${client.first_name}. Всего на счетах</p>
    <div class="balance-xl"><span data-count="${Math.trunc(totalByn / 100)}">${whole}</span><span class="balance-xl__cents">,${cents}</span> <span class="balance-xl__unit">BYN</span></div>
    <div class="actions mt10">
      <a class="btn" href="/transfers/new">Перевести</a>
      <a class="btn" href="/payments/catalog">Оплатить услугу</a>
      <a class="btn btn--ghost" href="/accounts/new">Открыть счёт</a>
    </div>
    ${nextPayment ? html`<a class="overview__note${nextPayment.overdue ? ' text-bad' : ''}" href="/loans">${nextPayment.overdue ? 'Просроченный платёж по кредиту' : 'Платёж по кредиту'} ${formatAmount(nextPayment.total)} BYN до ${dmy(nextPayment.dueDate)}</a>` : ''}
  </div>
  <div class="tile overview__accounts">
    ${accounts.map((a) => html`<a class="account" href="/accounts/${a.id}">
        <div><div class="account__title">${a.title}</div><div class="account__iban">${formatIban(a.iban)}</div></div>
        <div class="amount">${formatAmount(a.balance)} <small>${a.currency}</small></div>
      </a>`)}
    ${accounts.length ? '' : html`<p class="muted m0">Счетов пока нет.</p>`}
  </div>
</section>

<section class="quad">
  <a class="quad__tile quad__cards" href="/cards">
    <h2>Платёжные карты</h2>
    <p>${cards ? `Активных карт: ${cards}. Лимиты и блокировка в один клик.` : 'Выпустите виртуальную карту за минуту.'}</p>
    <span class="quad__card" aria-hidden="true"><span class="quad__card-bank">ТалерБанк</span><span class="quad__card-chip"></span><span class="quad__card-num">4821 0034 7712 5560</span></span>
  </a>
  <a class="quad__tile quad__deposits" href="/deposits">
    <h2>Вклады</h2>
    <p>${deposits.count ? `Открыто вкладов: ${deposits.count}, на них ${formatAmount(deposits.total)} BYN.` : `Откройте вклад в рублях или валюте. До ${percent(maxDepositRate)}% годовых.`}</p>
    <img class="quad__coin" src="/img/emblem.png" alt="" width="260" height="260">
  </a>
  <a class="quad__tile quad__loans" href="/loans">
    <h2>Кредиты</h2>
    <p>${loans.count ? `Остаток долга ${formatAmount(loans.debt)} BYN.` : 'Рассчитайте платёж и подайте заявку онлайн.'}</p>
    <span class="quad__rate" aria-hidden="true">от ${percent(minLoanRate)}%</span>
  </a>
  <a class="quad__tile quad__pay" href="/payments">
    <h2>Платежи и переводы</h2>
    <p>Коммунальные услуги, связь, налоги и переводы клиентам банка.</p>
    <img class="quad__coin quad__coin--pay" src="/img/emblem.png" alt="" width="220" height="220">
  </a>
</section>

<section class="split">
  <div>
    <div class="between"><h2>Последние операции</h2><a class="link" href="${accounts[0] ? `/accounts/${accounts[0].id}/statement` : '/accounts'}">Выписка</a></div>
    ${operations.length ? '' : html`<p class="muted">Операций пока нет. Пополните счёт в отделении или переведите деньги.</p>`}
    ${operations.map((o) => html`<div class="op">
        <div><div class="op__title">${o.description || o.type}</div><div class="op__meta">${dmy(o.bank_date)}</div></div>
        <div class="op__sum${o.signed > 0 ? ' text-good' : ''}">${o.signed > 0 ? '+' : ''}${formatAmount(o.signed)} ${o.currency}</div>
      </div>`)}
  </div>
  <div>
    <div class="between"><h2>Курсы Нацбанка</h2><a class="link" href="/rates">Конвертер</a></div>
    ${rates.map((r) => html`<div class="op"><div class="op__title">${r.currency}${r.scale > 1 ? html` <span class="muted2">за ${r.scale}</span>` : ''}</div><div class="op__sum">${String(r.rate).replace('.', ',')} BYN</div></div>`)}
  </div>
</section>`
  };
}
