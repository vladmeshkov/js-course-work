// Шапка сайта: утилитная полоса, поиск, логотип, меню по роли. Обработчики навешиваются один раз на контейнер (делегирование),
// поэтому шапку можно перерисовывать при каждом переходе.
import { html } from './html.js';
import { api } from './api.js';

const LOGO = html`<img src="/img/emblem.png" alt="Эмблема ТалерБанка: оранжевый круг с монограммой Тр" width="54" height="54">
        <span>Талер<span class="logo__bank">Банк</span></span>`;

/** Разметка шапки по состоянию сессии и текущему пути. */
export function headerHtml(session, path) {
  const { user, nav, unread } = session;
  return html`
<header class="site-header">
  <div class="util-bar">
    <div class="util-bar__in">
      <span>${user ? user.roleName : 'Интернет-банкинг для физических лиц'}</span>
      <div class="util-bar__links">
        <a href="/rates">Курсы валют</a>
        <button class="search-toggle" type="button" id="search-toggle" aria-expanded="false" aria-controls="search-panel">Поиск <kbd>/</kbd></button>
        <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" title="Переключить тему"><span class="theme-toggle__icon" aria-hidden="true"></span><span data-theme-label>Тёмная тема</span></button>
        ${user ? html`
          <a href="/security">Безопасность</a>
          <a class="bell" href="/notifications" aria-label="Уведомления${unread ? ', непрочитанных: ' + unread : ''}">Уведомления${unread ? html`<span class="bell__count">${unread > 99 ? '99+' : unread}</span>` : ''}</a>` : ''}
        <a class="phone-link" href="tel:147">147</a>
      </div>
    </div>
  </div>
  <div class="search-panel" id="search-panel" role="dialog" aria-label="Поиск по банку" hidden>
    <div class="search-panel__in">
      <div class="search-panel__row">
        <label for="search-q">Что вы ищете</label>
        <input id="search-q" type="search" placeholder="Перевод, ЖКУ, вклад, номер счёта" autocomplete="off">
        <button class="link-btn" type="button" id="search-close">Закрыть</button>
      </div>
      <div class="chips" id="search-cats"></div>
      <div id="search-results" aria-live="polite"></div>
    </div>
  </div>
  <div class="top-bar">
    <div class="top-bar__in">
      <a class="logo" href="/">${LOGO}</a>
      <nav class="main-nav${nav.length > 5 ? ' main-nav--dense' : ''}" aria-label="Основное меню">
        ${nav.map((item) => html`<a href="${item.href}"${path === item.href ? html` aria-current="page"` : ''}>${item.label}</a>`)}
      </nav>
      <div class="top-bar__actions">
        ${user
          ? html`<button class="btn btn--ghost btn--small" type="button" data-logout>Выйти &nbsp;→</button>`
          : html`<a class="btn btn--ghost btn--small" href="/login">Войти</a><a class="btn btn--small" href="/register">Стать клиентом</a>`}
      </div>
    </div>
  </div>
  ${user ? '' : html`<div class="guest-strip"><div class="guest-strip__in">Вы в гостевом режиме. Доступны курсы валют и калькуляторы. Для платежей и переводов <a href="/login">войдите в кабинет</a>.</div></div>`}
</header>`;
}

// ---------- поиск по банку ----------
let index = null;
let category = 'Все';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSearch() {
  const input = document.getElementById('search-q');
  const cats = document.getElementById('search-cats');
  const results = document.getElementById('search-results');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  const list = (index ?? []).filter((it) => (category === 'Все' || it.cat === category) && (!q || `${it.title} ${it.sub} ${it.group}`.toLowerCase().includes(q)));
  cats.textContent = '';
  for (const c of ['Все', ...new Set((index ?? []).map((i) => i.cat))]) {
    const b = el('button', 'chip', c);
    b.type = 'button';
    b.setAttribute('aria-selected', String(c === category));
    b.addEventListener('click', () => { category = c; renderSearch(); });
    cats.appendChild(b);
  }
  results.textContent = '';
  if (!list.length) { results.appendChild(el('div', 'search-empty', 'Ничего не нашли. Попробуйте «перевод», «вклад» или «счёт».')); return; }
  const groups = {};
  list.slice(0, 40).forEach((it) => { (groups[it.group] ??= []).push(it); });
  for (const [name, items] of Object.entries(groups)) {
    const box = el('div', 'search-group');
    box.appendChild(el('div', 'search-group__title', name));
    for (const it of items) {
      const a = el('a', 'search-item');
      a.href = it.href;
      a.appendChild(el('span', 'search-item__mark', it.mark));
      const t = el('span', 'search-item__txt');
      t.appendChild(el('b', '', it.title));
      if (it.sub) t.appendChild(el('small', '', it.sub));
      a.appendChild(t);
      a.appendChild(el('span', 'search-item__hint', it.hint));
      box.appendChild(a);
    }
    results.appendChild(box);
  }
}

async function openSearch() {
  const panel = document.getElementById('search-panel');
  if (!panel) return;
  panel.hidden = false;
  document.getElementById('search-toggle').setAttribute('aria-expanded', 'true');
  document.getElementById('search-q').focus();
  if (!index) {
    try { index = await api.get('/search/index'); } catch { index = []; }
  }
  renderSearch();
}

function closeSearch() {
  const panel = document.getElementById('search-panel');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  const toggle = document.getElementById('search-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.focus();
}

/** Сбрасывает кэш индекса поиска (после входа и выхода меняются доступные пункты). */
export function resetSearch() {
  index = null;
  category = 'Все';
}

/** Один раз подключает обработчики шапки: поиск, выход, переключатель темы (его обработчик в theme.js вешается на кнопки при загрузке). */
export function bindHeader(root, { onLogout }) {
  root.addEventListener('click', (event) => {
    const t = event.target;
    if (t.closest('#search-toggle')) {
      const panel = document.getElementById('search-panel');
      if (panel.hidden) openSearch(); else closeSearch();
    } else if (t.closest('#search-close')) closeSearch();
    else if (t.closest('[data-logout]')) onLogout();
    else if (t.closest('[data-theme-toggle]')) window.talerTheme.toggle();
    else if (t.closest('.search-item')) closeSearch();
  });
  root.addEventListener('input', (event) => { if (event.target.id === 'search-q') renderSearch(); });
  document.addEventListener('keydown', (event) => {
    const panel = document.getElementById('search-panel');
    if (event.key === 'Escape' && panel && !panel.hidden) closeSearch();
    const tag = event.target?.tagName ?? '';
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && panel?.hidden) { event.preventDefault(); openSearch(); }
  });
}
