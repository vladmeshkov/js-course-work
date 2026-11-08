import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { percent } from '../lib/format.js';
import { ratesBlock, mountConverter } from '../lib/rates-block.js';

/** Главная для гостя. Вошедший пользователь сразу попадает в свой кабинет. */
export default async function page({ session }) {
  if (session.user) return { redirect: session.user.roleCode === 'client' ? '/cabinet' : '/workplace' };
  const { maxDepositRate, minLoanRate, rates } = await api.get('/home');
  return {
    title: 'ТалерБанк',
    body: html`<section class="duo duo--hero">
  <div class="hero-dark">
    <h1>Откройте счёт, не выходя из дома</h1>
    <p>Нужны паспорт и номер телефона. Деньги и карта доступны сразу после проверки анкеты.</p>
    <div class="actions">
      <a class="btn btn--lg" href="/register">Стать клиентом</a>
      <a class="btn btn--lg btn--outline-light" href="/deposits">Посмотреть вклады</a>
    </div>
    <img class="hero-dark__coin" src="/img/coin-cut.png" alt="Объёмная монета ТалерБанка на металлической подставке" width="350" height="407">
  </div>
  <div class="prod-col">
    <a class="prod-tile" href="/deposits"><span class="prod-tile__name">Вклады</span><span class="prod-tile__row"><span class="prod-tile__hint">Рассчитайте доход за минуту</span><span class="prod-tile__rate prod-tile__rate--accent">${percent(maxDepositRate)}%</span></span></a>
    <a class="prod-tile prod-tile--accent" href="/loans"><span class="prod-tile__name">Кредиты</span><span class="prod-tile__row"><span class="prod-tile__hint">Платёж и график до заявки</span><span class="prod-tile__rate">${percent(minLoanRate)}%</span></span></a>
  </div>
</section>
${ratesBlock(rates)}`,
    mount: mountConverter
  };
}
