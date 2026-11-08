import { html } from '../lib/html.js';
import { api, ApiError } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';
import { flag } from '../lib/flags.js';

const comma = (value) => String(value).replace('.', ',');

export default async function page({ navigate }) {
  const { spreads, groups } = await api.get('/admin/rates');
  return {
    title: 'Курсы и тарифы',
    body: html`<div class="between"><h1>Курсы и тарифы</h1>
  <form id="refresh-form"><button class="btn btn--ghost" type="submit">Обновить курсы с Нацбанка</button></form></div>
<form class="panel" id="spreads-form" novalidate>
  <div class="between"><h2 class="mb10">Спред банка к курсу Нацбанка</h2>
    <div class="chips" role="group" aria-label="Быстрый выбор спреда"><span class="muted">Одинаковый спред:</span>
      ${['1', '1,5', '2,5'].map((v) => html`<button class="chip" type="button" data-spread="${v}">${v}%</button>`)}</div></div>
  <div class="scroll-x"><table class="table">
    <thead><tr><th>Валюта</th><th>Курс НБ РБ</th><th>Банк покупает, %</th><th>Банк продаёт, %</th><th>Курс покупки</th><th>Курс продажи</th></tr></thead>
    <tbody>
      ${spreads.map((s) => {
        const unit = s.rate === null ? null : s.rate / s.scale;
        return html`<tr>
          <td><div class="cur-cell">${flag(s.currency, 34)}<b>${s.currency}</b>${s.scale > 1 ? html` <span class="muted2">за ${s.scale}</span>` : ''}</div></td>
          <td>${s.rate === null ? '—' : comma(s.rate)}</td>
          <td><input class="mini" name="${s.currency}_buy" value="${comma(s.buy_percent)}" aria-label="Спред покупки ${s.currency}"><div class="field__error" data-error="${s.currency}_buy" hidden></div></td>
          <td><input class="mini" name="${s.currency}_sell" value="${comma(s.sell_percent)}" aria-label="Спред продажи ${s.currency}"><div class="field__error" data-error="${s.currency}_sell" hidden></div></td>
          <td>${unit === null ? '—' : comma((unit * s.scale * (1 - s.buy_percent / 100)).toFixed(4))}</td>
          <td>${unit === null ? '—' : comma((unit * s.scale * (1 + s.sell_percent / 100)).toFixed(4))}</td>
        </tr>`;
      })}
    </tbody>
  </table></div>
  ${formError()}
  <div class="rates-bar"><span class="muted" id="rates-changes" aria-live="polite">Изменений нет</span><span class="rates-bar__btns"><button class="link-btn" type="button" id="rates-reset">Сбросить</button><button class="btn" type="submit">Опубликовать спред</button></span></div>
</form>
<form class="panel form" id="settings-form" novalidate>
  ${groups.map((g) => html`<h2>${g.name}</h2>
    ${g.items.map((it) => html`<div class="setting">
        <label for="s-${it.key}">${it.label}</label>
        <span class="setting__input"><input id="s-${it.key}" name="${it.key}" value="${it.value}" inputmode="decimal"><span class="muted">${it.unit}</span></span>
        ${errorSlot(it.key)}
      </div>`)}`)}
  ${formError()}
  <div><button class="btn" type="submit">Сохранить тарифы</button></div>
</form>`,
    mount(root) {
      const spreadsForm = root.querySelector('#spreads-form');
      const inputs = [...spreadsForm.querySelectorAll('input.mini')];
      const counter = root.querySelector('#rates-changes');
      const chips = [...spreadsForm.querySelectorAll('[data-spread]')];
      const count = () => {
        const n = inputs.filter((i) => i.value !== i.defaultValue).length;
        counter.textContent = n ? `Изменено значений: ${n}` : 'Изменений нет';
      };
      const select = (active) => chips.forEach((c) => c.setAttribute('aria-selected', String(c === active)));
      spreadsForm.addEventListener('input', count);
      chips.forEach((chip) => chip.addEventListener('click', () => {
        inputs.forEach((i) => { i.value = chip.dataset.spread; });
        select(chip);
        count();
      }));
      root.querySelector('#rates-reset').addEventListener('click', () => {
        inputs.forEach((i) => { i.value = i.defaultValue; });
        select(null);
        count();
      });

      const reload = () => navigate('/admin/rates', { replace: true });
      bindForm(spreadsForm, async (data) => {
        const result = await api.post('/admin/rates/spreads', data);
        flash('success', result.message);
        await reload();
      });
      bindForm(root.querySelector('#refresh-form'), async () => {
        const result = await api.post('/admin/rates/refresh');
        flash(result.level, result.message);
        await reload();
      });
      const settingsForm = root.querySelector('#settings-form');
      bindForm(settingsForm, async (data) => {
        try {
          const result = await api.post('/admin/rates/settings', data);
          flash('success', result.message);
        } catch (error) {
          // строка настройки с ошибкой подсвечивается, как поле формы
          if (error instanceof ApiError) {
            // после bindForm: он сбрасывает подсветку перед показом ошибок
            setTimeout(() => {
              for (const name of Object.keys(error.fields)) settingsForm.querySelector(`[name="${name}"]`)?.closest('.setting')?.classList.add('field--error');
            }, 0);
          }
          throw error;
        }
        await reload();
      });
    }
  };
}
