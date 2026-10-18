// Общая разметка карт для страниц «Мои карты» и карточки карты.
import { html } from './html.js';

/** Классы лицевой стороны карты: система и признак блокировки. */
export function cardClass(card) {
  return `bank-card bank-card--${card.system}${card.status === 'blocked' ? ' bank-card--blocked' : ''}`;
}

/** Содержимое лицевой стороны карты (банк, система, номер, держатель, срок, штамп блокировки). */
export function cardFace(card, systems) {
  return html`<span class="bank-card__top"><span class="bank-card__bank"><img src="/img/emblem.png" alt="" width="30" height="30">ТалерБанк</span><span class="bank-card__system">${systems[card.system]}</span></span>
      <span class="bank-card__number">•••• •••• •••• ${card.last4}</span>
      <span class="bank-card__bottom"><span>${card.holder}</span><span>${card.expires}</span></span>
      ${card.status === 'blocked' ? html`<span class="bank-card__stamp">Заблокирована</span>` : ''}`;
}
