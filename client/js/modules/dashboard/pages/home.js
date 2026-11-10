import { html } from '../../../lib/html.js';
import { api } from '../../../lib/api.js';
import { percent } from '../../../lib/format.js';
import { ratesBlock, mountConverter } from '../../../lib/rates-block.js';

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
    <img class="hero-dark__coin" src="/img/3d/coin-stand.webp" alt="Объёмная монета ТалерБанка на металлической подставке" width="350" height="388">
  </div>
  <div class="prod-col">
    <a class="prod-tile" href="/deposits"><span class="prod-tile__name">Вклады</span><span class="prod-tile__row"><span class="prod-tile__hint">Рассчитайте доход за минуту</span><span class="prod-tile__rate prod-tile__rate--accent">${percent(maxDepositRate)}%</span></span></a>
    <a class="prod-tile prod-tile--accent" href="/loans"><span class="prod-tile__name">Кредиты</span><span class="prod-tile__row"><span class="prod-tile__hint">Платёж и график до заявки</span><span class="prod-tile__rate">${percent(minLoanRate)}%</span></span></a>
  </div>
</section>
${ratesBlock(rates)}
<section class="why">
  <h2 class="sec-title">Почему ТалерБанк</h2>
  <div class="why__grid">
    <div class="why__item"><img src="/img/3d/shield.webp" alt="" width="72" height="72" loading="lazy"><b>Деньги под защитой</b><span>Подтверждение операций кодом, двухфакторный вход и контроль подозрительных переводов.</span></div>
    <div class="why__item"><img src="/img/3d/phone-wifi.webp" alt="" width="72" height="72" loading="lazy"><b>Всё в интернет-банке</b><span>Счета, переводы, платежи, вклады и кредиты без визита в отделение, круглосуточно.</span></div>
    <div class="why__item"><img src="/img/3d/growth.webp" alt="" width="72" height="72" loading="lazy"><b>Честные условия</b><span>Курсы Нацбанка со спредом банка, тарифы и комиссии открыты на сайте.</span></div>
    <div class="why__item"><img src="/img/3d/safe.webp" alt="" width="72" height="72" loading="lazy"><b>Вклады до ${percent(maxDepositRate)}%</b><span>Доход виден до открытия: калькулятор считает по дням, без мелкого шрифта.</span></div>
  </div>
</section>
<section class="steps">
  <h2 class="sec-title">Как стать клиентом</h2>
  <div class="steps__grid">
    <div class="steps__item"><span class="steps__no">1</span><img src="/img/3d/laptop.webp" alt="" width="84" height="84" loading="lazy"><b>Заполните анкету</b><span>Онлайн, нужны паспорт и номер телефона. Займёт около пяти минут.</span></div>
    <div class="steps__item"><span class="steps__no">2</span><img src="/img/3d/hourglass.webp" alt="" width="84" height="84" loading="lazy"><b>Дождитесь проверки</b><span>Сотрудник банка проверит анкету в рабочее время и пришлёт уведомление.</span></div>
    <div class="steps__item"><span class="steps__no">3</span><img src="/img/3d/coins-up.webp" alt="" width="84" height="84" loading="lazy"><b>Пользуйтесь счётом</b><span>Счёт в BYN откроется автоматически. Сразу можно выпустить карту и открыть вклад.</span></div>
  </div>
</section>
<section class="card-banner">
  <div class="card-banner__text">
    <h2>Карта к счёту за минуту</h2>
    <p>Выпустите карту в кабинете: лимиты, блокировка и покупки в интернете включаются одним переключателем.</p>
    <a class="btn btn--lg" href="/register">Стать клиентом</a>
  </div>
  <img src="/img/3d/card.webp" alt="Платёжная карта ТалерБанка" width="300" height="222" loading="lazy">
</section>`,
    mount: mountConverter
  };
}
