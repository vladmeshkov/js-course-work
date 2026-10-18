// Клиентский маршрутизатор на History API. Страницы подгружаются по требованию (динамический import),
// каждая страница это модуль с default-функцией: async (ctx) => ({ title, body, mount?(root) }).
import { api, setCsrfToken, ApiError } from './api.js';
import { html } from './html.js';
import { headerHtml, bindHeader, resetSearch } from './layout.js';
import * as motion from './motion.js';
import { takeFlash, showAlert, flash } from './ui.js';

const routes = [];
let session = null;
let current = null;
let renderId = 0;

/** Подключает список маршрутов модуля: [{ path: '/accounts/:id', load: () => import(...), access: 'client' }]. */
export function register(list) {
  for (const r of list) {
    const names = [];
    const pattern = r.path.replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
    routes.push({ ...r, regex: new RegExp(`^${pattern}/?$`), names });
  }
}

export const getSession = () => session;

/** Загружает состояние сессии с сервера (пользователь, меню, токен CSRF). */
export async function refreshSession() {
  session = await api.get('/session');
  setCsrfToken(session.csrfToken);
  resetSearch();
  return session;
}

function match(pathname) {
  for (const r of routes) {
    const m = r.regex.exec(pathname);
    if (m) return { route: r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** Доступ к маршруту по роли: public, auth, client, staff или { permission }. */
function allowed(access = 'public') {
  const u = session.user;
  if (access === 'public') return true;
  if (!u) return false;
  if (access === 'auth') return true;
  if (access === 'client') return u.roleCode === 'client';
  if (access === 'staff') return u.roleCode !== 'client';
  if (access.permission) return u.permissions.includes(access.permission);
  return true;
}

function errorPage(status, message) {
  return {
    title: status === 404 ? 'Страница не найдена' : 'Ошибка',
    body: html`<section class="tile w720">
      <div class="muted2">${status}</div>
      <h1 class="iban-line">${status === 404 ? 'Такой страницы нет' : status === 403 ? 'Нет доступа' : 'Что-то пошло не так'}</h1>
      <p class="muted mb22">${message}</p>
      <a class="btn" href="/">На главную</a>
    </section>`
  };
}

function renderHeader(path) {
  document.getElementById('site-header').innerHTML = headerHtml(session, path).toString();
  window.talerTheme?.sync();
}

/** Открывает адрес без перезагрузки страницы. */
export function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  return render();
}

/** После входа возвращает на страницу, которую пользователь открывал до перехода на вход. */
export function rememberReturn(path) {
  try { sessionStorage.setItem('returnTo', path); } catch { /* без возврата */ }
}

export function takeReturn() {
  try {
    const value = sessionStorage.getItem('returnTo');
    sessionStorage.removeItem('returnTo');
    return value;
  } catch {
    return null;
  }
}

async function render() {
  const id = ++renderId;
  const url = new URL(location.href);
  const found = match(url.pathname);
  const main = document.getElementById('content');
  motion.busy();
  let page;
  try {
    if (!found) page = errorPage(404, 'Проверьте адрес или вернитесь на главную страницу.');
    else if (!allowed(found.route.access)) {
      if (!session.user) {
        rememberReturn(url.pathname + url.search);
        history.replaceState(null, '', '/login');
        return render();
      }
      page = errorPage(403, 'Недостаточно прав для этого раздела.');
    } else {
      const module = await found.route.load();
      page = await module.default({
        params: found.params, query: Object.fromEntries(url.searchParams), session, navigate, refreshSession
      });
    }
  } catch (error) {
    if (id !== renderId) return;
    if (error instanceof ApiError && error.code === 'unauthorized') {
      await refreshSession();
      rememberReturn(url.pathname + url.search);
      history.replaceState(null, '', '/login');
      return render();
    }
    if (error instanceof ApiError && error.code === 'staff_2fa_required') {
      flash('info', error.message);
      history.replaceState(null, '', '/security/2fa/setup');
      return render();
    }
    if (error instanceof ApiError) page = errorPage(error.status || 500, error.message);
    else { console.error(error); page = errorPage(500, 'Не удалось показать страницу. Обновите её и повторите.'); }
  } finally {
    if (id === renderId) motion.done();
  }
  if (id !== renderId) return;
  if (page.redirect) {
    history.replaceState(null, '', page.redirect);
    return render();
  }
  // страница могла сменить состояние сессии (вход, выход, уведомления): шапка рисуется после её загрузки
  const show = () => {
    renderHeader(url.pathname);
    document.title = `${page.title} · ТалерБанк`;
    main.innerHTML = page.body.toString();
    const message = takeFlash();
    if (message) showAlert(main, message.type, message.message);
    current?.cleanup?.();
    current = page;
    page.mount?.(main);
    motion.init(main);
    window.scrollTo(0, 0);
  };
  if (document.startViewTransition && !motion.reducedMotion) await document.startViewTransition(show).updateCallbackDone;
  else show();
}

function onClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = event.target.closest?.('a[href]');
  if (!a || a.target || a.hasAttribute('download') || a.dataset.native !== undefined) return;
  const href = a.getAttribute('href');
  if (/^(#|mailto:|tel:|[a-z]+:)/i.test(href) || href.startsWith('/api/') || /\.pdf($|\?)/.test(href)) return;
  event.preventDefault();
  if (href !== location.pathname + location.search) navigate(href);
}

/** Запуск приложения: сессия, шапка, первый экран. */
export async function start() {
  motion.setup();
  await refreshSession();
  bindHeader(document.getElementById('site-header'), {
    async onLogout() {
      await api.post('/logout');
      await refreshSession();
      navigate('/');
    }
  });
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', render);
  await render();
}
