import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs, bindForm, errorSlot, formError, flash } from '../lib/ui.js';
import { formatAmount, percent } from '../lib/format.js';

/** Открытие вклада: выбор вклада, счёт списания, сумма с ползунком и живой расчёт дохода (формула одна, на сервере). */
export default async function page({ query, navigate }) {
  const { product, products, accounts } = await api.get('/deposits/new', { product: query.product });
  const minRub = Math.round(Number(product.min_amount) / 100);
  const startAmount = formatAmount(Math.max(Number(product.min_amount), 400000));
  let timer = 0;
  let requestNo = 0;
  return {
    title: `Открыть вклад «${product.name}»`,
    body: html`${crumbs([['Главная', '/'], ['Вклады', '/deposits'], 'Открыть вклад'])}
<h1>Открыть вклад</h1>
<section class="dep">
  <div class="dep__main">
    <div class="dep__block">
      <h2>Выберите вклад</h2>
      ${products.map((p) => html`<a class="dep__prod" href="/deposits/new?product=${p.id}"${p.id === product.id ? html` aria-current="true"` : ''}>
          <span><span class="dep__name">«${p.name}»</span><span class="dep__note">${p.term_months} мес., от ${formatAmount(p.min_amount)} ${p.currency}. ${p.capitalization ? 'Проценты прибавляются к вкладу' : 'Проценты выплачиваются на счёт'}</span></span>
          <span class="dep__rate">${percent(p.rate_percent)}%</span>
        </a>`)}
    </div>
    <form class="dep__form" id="dep-form" novalidate>
      <input type="hidden" name="productId" value="${product.id}">
      ${formError()}
      <div class="field">
        <label for="sourceAccountId">Списать со счёта</label>
        <select id="sourceAccountId" name="sourceAccountId">
          ${accounts.map((a) => html`<option value="${a.id}">${a.title}, ${formatAmount(a.balance)} ${a.currency}</option>`)}
        </select>
        ${!accounts.length ? html`<span class="field__hint">Нет счёта в валюте ${product.currency}. Сначала откройте такой счёт.</span>` : ''}
        ${errorSlot('sourceAccountId')}
      </div>
      <div class="field">
        <label for="amount">Сумма вклада, ${product.currency}</label>
        <input id="amount" name="amount" value="${startAmount}" inputmode="decimal" autocomplete="off" placeholder="От ${formatAmount(product.min_amount)}">
        <input class="range" id="amount-range" type="range" min="${minRub}" max="50000" step="100" value="${minRub}" aria-label="Сумма вклада ползунком">
        <div class="range__scale"><span>${minRub}</span><span>50 000</span></div>
        ${errorSlot('amount')}
      </div>
    </form>
    <div>
      <div class="dep__bar" aria-hidden="true"><div class="dep__bar-main" id="dep-bar"></div><div class="dep__bar-income"></div></div>
      <div class="dep__bar-caption"><span class="muted">Вы вложите <span id="dep-sum">—</span></span><b id="dep-income-cap">Доход —</b></div>
    </div>
  </div>
  <aside class="dep__aside" aria-live="polite">
    <div class="dep__aside-lead">К получению через ${product.term_months} мес.</div>
    <div class="dep__total" id="calc-total">—</div>
    <div class="dep__facts">
      <div><span>Ставка</span><span>${percent(product.rate_percent)}% годовых</span></div>
      <div><span>Доход за срок</span><span id="calc-income">—</span></div>
      <div><span>Проценты</span><span>${product.capitalization ? 'капитализация' : 'на счёт'}</span></div>
    </div>
    <p class="dep__aside-note">${product.revocable ? 'При досрочном закрытии проценты пересчитываются по сниженной ставке.' : 'Досрочное закрытие по этому вкладу невозможно.'}</p>
    <button class="btn btn--lg" type="submit" form="dep-form"${accounts.length ? '' : html` disabled`}>Открыть вклад</button>
  </aside>
</section>`,
    mount(root) {
      const form = root.querySelector('#dep-form');
      const input = root.querySelector('#amount');
      const range = root.querySelector('#amount-range');
      const income = root.querySelector('#calc-income');
      const total = root.querySelector('#calc-total');
      const bar = root.querySelector('#dep-bar');
      const sumEl = root.querySelector('#dep-sum');
      const cap = root.querySelector('#dep-income-cap');

      const money = (minor, currency) => `${formatAmount(minor)} ${currency}`;
      const toNumber = (text) => parseFloat(String(text).replace(/\s/g, '').replace(',', '.'));

      async function update() {
        const mine = ++requestNo;
        income.classList.add('skeleton');
        total.classList.add('skeleton');
        try {
          const data = await api.get('/deposits/calc', { product: product.id, amount: input.value });
          if (mine !== requestNo) return;
          income.textContent = data.ok ? money(data.income, data.currency) : '—';
          total.textContent = data.ok ? money(data.total, data.currency) : '—';
          if (data.ok) {
            bar.style.setProperty('width', `${Math.max(60, Math.min(94, Math.round((data.total - data.income) / data.total * 100)))}%`);
            sumEl.textContent = money(data.total - data.income, data.currency);
            cap.textContent = `Доход ${money(data.income, data.currency)}`;
          }
        } catch { /* расчёт необязателен: форма работает и без него */ }
        if (mine === requestNo) {
          income.classList.remove('skeleton');
          total.classList.remove('skeleton');
        }
      }

      const syncRange = () => { range.value = toNumber(input.value) || range.min; };
      range.addEventListener('input', () => {
        input.value = `${String(range.value).replace('.', ',')},00`;
        clearTimeout(timer);
        timer = setTimeout(update, 120);
      });
      input.addEventListener('input', () => {
        syncRange();
        clearTimeout(timer);
        timer = setTimeout(update, 250);
      });
      syncRange();
      if (input.value) update();

      bindForm(form, async (data) => {
        const result = await api.post('/deposits', data);
        flash('success', 'Вклад открыт');
        await navigate(`/deposits/${result.id}`);
      });
    },
    cleanup() { clearTimeout(timer); requestNo += 1; }
  };
}
