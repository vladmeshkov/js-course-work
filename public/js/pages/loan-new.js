import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs, bindForm, errorSlot, formError } from '../lib/ui.js';
import { formatAmount, dmy, percent } from '../lib/format.js';

const PREVIEW_ROWS = 6;

/** Заявка на кредит: ползунки суммы и срока, талон с предварительным расчётом и график платежей (расчёт на сервере). */
export default async function page({ query, navigate }) {
  const { product, accounts } = await api.get('/loans/new', { product: query.product });
  const minA = Math.round(Number(product.min_amount) / 100);
  const maxA = Math.round(Number(product.max_amount) / 100);
  const rateTxt = percent(product.rate_percent);
  let timer = 0;
  let requestNo = 0;
  return {
    title: `Кредит «${product.name}»`,
    body: html`${crumbs([['Главная', '/'], ['Кредиты', '/loans'], 'Заявка'])}
<section class="loan">
  <div class="loan__main">
    <div>
      <h1>${product.name.startsWith('Кредит') ? product.name : `Кредит ${product.name}`}</h1>
      <ul class="loan__terms">
        <li>Ставка ${rateTxt}% годовых</li>
        <li>От ${formatAmount(product.min_amount)} до ${formatAmount(product.max_amount)} BYN на срок до ${product.max_term} мес.</li>
        <li>Решение по скорингу сразу после отправки заявки</li>
      </ul>
    </div>
    <form class="loan__form" novalidate id="loan-form">
      <input type="hidden" name="productId" value="${product.id}">
      ${formError()}
      <div class="field">
        <div class="field__row"><label for="amount">Сумма кредита, BYN</label></div>
        <input id="amount" name="amount" value="15 000,00" inputmode="decimal" placeholder="От ${formatAmount(product.min_amount)}">
        <input class="range" id="amount-range" type="range" min="${minA}" max="${maxA}" step="100" value="15000" aria-label="Сумма кредита ползунком">
        <div class="range__scale"><span>${minA.toLocaleString('ru-RU')}</span><span>${maxA.toLocaleString('ru-RU')}</span></div>
        ${errorSlot('amount')}
      </div>
      <div class="field">
        <div class="field__row"><label for="termMonths">Срок, месяцев</label></div>
        <input id="termMonths" name="termMonths" type="number" min="${product.min_term}" max="${product.max_term}" value="36">
        <input class="range" id="term-range" type="range" min="${product.min_term}" max="${product.max_term}" step="1" value="36" aria-label="Срок ползунком">
        <div class="range__scale"><span>${product.min_term} мес.</span><span>${product.max_term} мес.</span></div>
        ${errorSlot('termMonths')}
      </div>
      <div class="loan__pair">
        <fieldset class="seg">
          <legend>Схема платежей</legend>
          <div class="seg__in">
          <label><input type="radio" name="scheduleType" value="annuity" checked><span>Аннуитетная</span></label>
          <label><input type="radio" name="scheduleType" value="differentiated"><span>Дифференцированная</span></label>
          </div>
        </fieldset>
        <div class="field"><label for="targetAccountId">Зачислить на счёт</label>
          <select id="targetAccountId" name="targetAccountId">${accounts.map((a) => html`<option value="${a.id}">${a.title}, ${formatAmount(a.balance)} BYN</option>`)}</select>${errorSlot('targetAccountId')}</div>
      </div>
      <h2 class="loan__sub">О вас</h2>
      <div class="form-grid">
        <div class="field"><label for="income">Доход в месяц, BYN</label><input id="income" name="income" inputmode="decimal">${errorSlot('income')}</div>
        <div class="field"><label for="obligations">Платежи по другим кредитам в месяц, BYN</label><input id="obligations" name="obligations" inputmode="decimal" placeholder="0">${errorSlot('obligations')}</div>
        <div class="field"><label for="experienceMonths">Стаж на текущем месте, месяцев</label><input id="experienceMonths" name="experienceMonths" type="number" min="0">${errorSlot('experienceMonths')}</div>
        <div class="field"><label for="dependents">Иждивенцев</label><input id="dependents" name="dependents" type="number" min="0" value="0">${errorSlot('dependents')}</div>
      </div>
    </form>
  </div>
  <aside class="talon" aria-live="polite">
    <div class="talon__edge talon__edge--top"></div>
    <div class="talon__body">
      <div class="talon__head"><img src="/img/emblem.png" alt="" width="30" height="30"><span>Предварительный расчёт</span></div>
      <div>
        <div class="muted" id="loan-pmt-label">Платёж в месяц</div>
        <div class="talon__sum"><span id="loan-pmt">—</span> <small>BYN</small></div>
      </div>
      <div class="talon__cut"></div>
      <div class="talon__rows">
        <div><span class="muted">Ставка</span><b>${rateTxt}% годовых</b></div>
        <div><span class="muted">Переплата</span><b id="loan-over">—</b></div>
        <div><span class="muted">Всего к возврату</span><b id="loan-total">—</b></div>
      </div>
      <p class="talon__ratio" id="loan-ratio"></p>
      <button class="btn btn--lg" type="submit" form="loan-form">Отправить заявку</button>
      <div class="talon__fine">Если заявку одобрит скоринг, договор подписывается кодом на следующем шаге.</div>
    </div>
    <div class="talon__edge talon__edge--bottom"></div>
  </aside>
</section>
<section class="panel loan__schedule" aria-live="polite">
  <div class="loan__schedule-head"><h2>График платежей</h2><span class="muted2" id="loan-count"></span></div>
  <div class="facts" id="loan-summary" hidden></div>
  <div class="scroll-x"><table class="table" id="loan-table" hidden>
    <thead><tr><th>№</th><th>Дата</th><th>Долг</th><th>Проценты</th><th>Платёж</th><th>Остаток</th></tr></thead><tbody></tbody></table></div>
  <button class="link-btn" type="button" id="loan-more" hidden>Показать весь график</button>
  <p class="muted2 m0" id="loan-hint">Введите сумму и срок, график появится здесь.</p>
</section>`,
    mount(root) {
      const form = root.querySelector('#loan-form');
      const f = form.elements;
      const table = root.querySelector('#loan-table');
      const body = table.querySelector('tbody');
      const summary = root.querySelector('#loan-summary');
      const hint = root.querySelector('#loan-hint');
      const more = root.querySelector('#loan-more');
      const amountRange = root.querySelector('#amount-range');
      const termRange = root.querySelector('#term-range');
      const byId = (id) => root.querySelector(`#${id}`);
      let showAll = false;
      let last = null;

      const num = (v) => parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));

      function cell(tr, text, strong) {
        const td = document.createElement('td');
        td.textContent = text;
        if (strong) td.className = 'strong';
        tr.appendChild(td);
      }

      function fact(label, value) {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        wrap.append(dt, dd);
        return wrap;
      }

      function render(data) {
        body.textContent = '';
        summary.textContent = '';
        if (!data.ok) {
          table.hidden = true;
          more.hidden = true;
          byId('loan-pmt').textContent = '—';
          hint.hidden = false;
          return;
        }
        hint.hidden = true;
        table.hidden = false;
        last = data;
        const shown = showAll ? data.rows : data.rows.slice(0, PREVIEW_ROWS);
        shown.forEach((r) => {
          const tr = document.createElement('tr');
          cell(tr, r.no);
          cell(tr, dmy(r.dueDate));
          cell(tr, formatAmount(r.principal));
          cell(tr, formatAmount(r.interest));
          cell(tr, formatAmount(r.total), true);
          cell(tr, formatAmount(r.balanceAfter));
          body.appendChild(tr);
        });
        more.hidden = data.rows.length <= PREVIEW_ROWS;
        more.textContent = showAll ? 'Свернуть' : 'Показать весь график';
        byId('loan-count').textContent = showAll ? `все ${data.rows.length}` : `первые ${Math.min(PREVIEW_ROWS, data.rows.length)} из ${data.rows.length}`;
        const first = data.rows[0].total;
        byId('loan-pmt').textContent = formatAmount(first);
        byId('loan-pmt-label').textContent = f.scheduleType.value === 'annuity' ? 'Платёж в месяц' : 'Первый платёж, дальше меньше';
        byId('loan-over').textContent = `${formatAmount(data.overpay)} BYN`;
        byId('loan-total').textContent = `${formatAmount(data.total)} BYN`;
        const income = num(f.income.value);
        const ratio = byId('loan-ratio');
        if (income > 0) {
          const share = Math.round(first / 100 / income * 100);
          ratio.textContent = `${share}% дохода уйдёт на платёж. ${share <= 40 ? 'Это в пределах нормы банка.' : 'Банк одобряет, если не больше 40%.'}`;
          ratio.className = `talon__ratio ${share <= 40 ? 'is-ok' : 'is-bad'}`;
        } else {
          ratio.textContent = 'Укажите доход, чтобы оценить нагрузку.';
          ratio.className = 'talon__ratio';
        }
        summary.hidden = false;
        summary.append(
          fact('Первый платёж', `${formatAmount(data.rows[0].total)} BYN`),
          fact('Всего выплат', `${formatAmount(data.total)} BYN`),
          fact('Переплата', `${formatAmount(data.overpay)} BYN`)
        );
      }

      async function update() {
        const mine = ++requestNo;
        table.classList.add('is-pending');
        summary.classList.add('is-pending');
        try {
          const data = await api.get('/loans/calc', { product: product.id, amount: f.amount.value, term: f.termMonths.value, type: f.scheduleType.value });
          if (mine === requestNo) render(data);
        } catch { /* расчёт необязателен: заявку можно отправить и без него */ }
        if (mine === requestNo) {
          table.classList.remove('is-pending');
          summary.classList.remove('is-pending');
        }
      }

      const schedule = (delay) => { clearTimeout(timer); timer = setTimeout(update, delay); };

      function sync() {
        const a = num(f.amount.value);
        if (isFinite(a)) amountRange.value = a;
        if (isFinite(num(f.termMonths.value))) termRange.value = num(f.termMonths.value);
      }

      amountRange.addEventListener('input', () => { f.amount.value = `${amountRange.value},00`; schedule(150); });
      termRange.addEventListener('input', () => { f.termMonths.value = termRange.value; schedule(150); });
      more.addEventListener('click', () => { showAll = !showAll; if (last) render(last); });
      f.income.addEventListener('input', () => { if (last) render(last); });
      form.addEventListener('change', (e) => { if (e.target.name === 'scheduleType') { clearTimeout(timer); update(); } });
      ['amount', 'termMonths'].forEach((name) => {
        f[name].addEventListener('input', () => { sync(); schedule(250); });
      });
      sync();
      update();

      bindForm(form, async (data) => {
        const result = await api.post('/loans', data);
        await navigate(`/loans/applications/${result.id}`);
      });
    },
    cleanup() { clearTimeout(timer); requestNo += 1; }
  };
}
