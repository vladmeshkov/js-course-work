// Общие помощники страниц переводов и платежей.
import { html } from './html.js';
import { formatAmount } from './format.js';

/** «1 услуга», «2 услуги», «5 услуг»: слово после числа. */
export function servicesWord(count) {
  const n = Number(count);
  if (n % 10 === 1 && n % 100 !== 11) return 'услуга';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'услуги';
  return 'услуг';
}

/** Варианты выпадающего списка счетов: «Название, 1 234,56 BYN». */
export function accountOptions(accounts, selected, { withCurrency = false } = {}) {
  return accounts.map((a) => html`<option value="${a.id}"${withCurrency ? html` data-currency="${a.currency}"` : ''}${String(selected) === String(a.id) ? ' selected' : ''}>${a.title}, ${formatAmount(a.balance)} ${a.currency}</option>`);
}

/** Строка про комиссию поставщика: «, комиссия 1,5%». */
export function feeNote(feePercent) {
  return Number(feePercent) > 0 ? `, комиссия ${String(Number(feePercent)).replace('.', ',')}%` : '';
}

/** Плашка с учебным кодом подтверждения (когда почта не настроена). */
export function demoCodeNote(demoCode) {
  return demoCode ? html`<div class="alert alert--info">Учебная версия: код вместо письма показан здесь: <b>${demoCode}</b></div>` : '';
}
