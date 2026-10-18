// Блок «Конвертер и курсы»: общий для главной гостя и страницы курсов.
import { html } from './html.js';
import { api } from './api.js';
import { flag } from './flags.js';
import { formatAmount, dmy } from './format.js';

/** Разметка блока. rates: список из GET /api/home или /api/rates. */
export function ratesBlock(rates) {
  return html`<section class="duo" aria-label="Валюты">
  <div class="panel conv">
    <div><h2>Конвертер валют</h2><p class="muted m0 mt8">Считаем по курсам банка.</p></div>
    <form class="conv__form" id="converter">
      <div class="conv__box">
        <label for="conv-amount" class="small muted">Отдаёте</label>
        <div class="conv__line">
          ${flag('byn', 40)}
          <input id="conv-amount" class="conv__input" value="1000" inputmode="decimal" autocomplete="off">
          <span class="conv__unit">BYN</span>
        </div>
      </div>
      <div class="cur-pills" role="radiogroup" aria-label="Валюта получения">
        ${rates.map((r, i) => html`<button type="button" class="cur-pill" role="radio" aria-checked="${i === 0}" data-cur="${r.currency}">${flag(r.code, 30)}${r.currency}</button>`)}
      </div>
      <div class="conv__result" aria-live="polite">
        <div class="small">Вы получите</div>
        <div class="conv__sum"><span id="conv-result">—</span> <span class="conv__cur" id="conv-cur">${rates[0] ? rates[0].currency : ''}</span></div>
      </div>
    </form>
  </div>
  <div class="panel rates">
    <div class="between"><h2>Курсы валют</h2><span class="muted2 small">${rates[0] ? dmy(rates[0].date) : ''}, Минск</span></div>
    ${rates.map((r) => html`<div class="rate-row">
        ${flag(r.code, 46)}
        <span class="rate-row__sym" aria-hidden="true">${r.symbol}</span>
        <span class="rate-row__name"><b>${r.currency}</b><span class="small muted2">${r.name}${r.scale > 1 ? ', ' + r.scale : ''}</span></span>
        <span class="rate-row__vals">
          <span class="rate-row__val"><span class="small muted2">Покупает</span><b>${r.buy}</b></span>
          <span class="rate-row__val"><span class="small muted2">Продаёт</span><b>${r.sell}</b></span>
        </span>
      </div>`)}
  </div>
</section>`;
}

/** Оживляет конвертер: расчёт делает сервер по курсам банка, формула одна на всю систему. */
export function mountConverter(root) {
  const amount = root.querySelector('#conv-amount');
  const result = root.querySelector('#conv-result');
  const label = root.querySelector('#conv-cur');
  const pills = root.querySelectorAll('.cur-pill');
  if (!amount || !pills.length) return;
  let current = pills[0].dataset.cur;
  let timer;
  let seq = 0;

  async function update() {
    const mine = ++seq;
    result.classList.add('skeleton');
    try {
      const d = await api.get('/rates/convert', { from: 'BYN', to: current, amount: amount.value });
      if (mine === seq) result.textContent = d.ok ? formatAmount(d.result) : '—';
    } catch { /* оставляем прежний результат */ }
    if (mine === seq) result.classList.remove('skeleton');
  }

  pills.forEach((pill) => pill.addEventListener('click', () => {
    current = pill.dataset.cur;
    label.textContent = current;
    pills.forEach((p) => p.setAttribute('aria-checked', String(p === pill)));
    update();
  }));
  root.querySelector('#converter').addEventListener('submit', (e) => e.preventDefault());
  amount.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 200); });
  update();
}
