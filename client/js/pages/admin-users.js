import { html } from '../lib/html.js';
import { api, query } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, formError, flash } from '../lib/ui.js';
import { stamp } from '../lib/admin-ui.js';

export default async function page({ session, query: params, navigate }) {
  const q = params.q ?? '';
  const role = params.role ?? '';
  const { users, roles } = await api.get('/admin/users', { q, role });
  const me = session.user.id;
  const staffRoles = roles.filter((r) => r.code !== 'client');
  const address = location.pathname + location.search;
  return {
    title: 'Пользователи',
    body: html`${crumbs([['Администрирование', '/workplace'], 'Пользователи'])}
<div class="q-head"><h1>Пользователи</h1><div class="muted">Всего ${users.length}, заблокировано ${users.filter((u) => u.status !== 'active').length}</div></div>
<form class="panel search" id="search-form" role="search">
  <input name="q" value="${q}" placeholder="Фамилия или логин" aria-label="Поиск пользователя">
  <input type="hidden" name="role" value="${role}">
  <div class="chips">
    <a class="chip" aria-selected="${String(!role)}" href="/admin/users${query({ q })}">Все</a>
    ${roles.map((r) => html`<a class="chip" aria-selected="${String(r.code === role)}" href="/admin/users${query({ role: r.code, q })}">${r.name}</a>`)}
  </div>
</form>
<section class="panel user-list">
  ${users.length ? '' : html`<div class="pay-empty">Никого не нашли. Проверьте фамилию или смените роль.</div>`}
  ${users.map((u) => {
    const active = u.status === 'active';
    return html`<div class="user-item">
      <div class="account user-row">
        <span class="user-row__ini" aria-hidden="true">${(u.last_name ? u.last_name[0] + (u.first_name || '')[0] : u.login.slice(0, 2)).toUpperCase()}</span>
        <div class="user-row__main"><div class="account__title">${u.last_name ? u.last_name + ' ' + u.first_name : u.login}</div>
          <div class="account__iban">${u.login}, ${u.last_login_at ? 'вход ' + stamp(u.last_login_at) : 'не входил'}</div></div>
        <span class="user-row__role">${u.role_name}</span>
        <span class="user-row__status ${active ? 'text-good' : 'text-bad'}">${active ? 'Активен' : 'Заблокирован'}</span>
        ${u.id !== me
          ? html`<button class="btn btn--ghost btn--small user-row__btn${active ? ' btn--danger' : ''}" type="button" data-confirm-toggle="u${u.id}">${active ? 'Заблокировать' : 'Разблокировать'}</button>`
          : html`<span class="muted2">это вы</span>`}
      </div>
      ${u.id !== me ? html`<form class="user-confirm" id="u${u.id}" data-block="${u.id}" data-action="${active ? 'block' : 'unblock'}" hidden>
        <span>${active ? 'Пользователь не сможет войти и выполнять операции.' : 'Пользователь снова сможет войти в кабинет.'}</span>
        <span class="user-confirm__btns"><button class="btn btn--small" type="submit">Подтвердить</button><button class="link-btn" type="button" data-confirm-cancel="u${u.id}">Отмена</button></span>
      </form>
      ${u.role_code !== 'client' ? html`<form class="user-role" data-role="${u.id}">
        <label class="muted2" for="role-${u.id}">Роль</label>
        <select id="role-${u.id}" class="mini mini--wide" name="roleCode">${staffRoles.map((r) => html`<option value="${r.code}"${r.code === u.role_code ? ' selected' : ''}>${r.name}</option>`)}</select>
        <button class="link-btn" type="submit">Сменить</button></form>` : ''}` : ''}
    </div>`;
  })}
</section>
<form class="panel form w640" id="create-form" novalidate>
  <h2>Добавить сотрудника</h2>
  <div class="field"><label for="login">Логин</label><input id="login" name="login" autocomplete="off">${errorSlot('login')}</div>
  <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="new-password">${errorSlot('password')}</div>
  <div class="field"><label for="roleCode">Роль</label><select id="roleCode" name="roleCode">${staffRoles.map((r) => html`<option value="${r.code}">${r.name}</option>`)}</select>${errorSlot('roleCode')}</div>
  ${formError()}
  <div><button class="btn" type="submit">Добавить</button></div>
</form>`,
    mount(root) {
      root.querySelector('#search-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        navigate(`/admin/users${query({ q: form.q.value.trim(), role: form.role.value })}`);
      });
      // раскрытие и скрытие подтверждения блокировки
      root.addEventListener('click', (event) => {
        const open = event.target.closest('[data-confirm-toggle]');
        const cancel = event.target.closest('[data-confirm-cancel]');
        if (open) { const f = root.querySelector(`#${open.dataset.confirmToggle}`); if (f) f.hidden = !f.hidden; }
        if (cancel) { const f = root.querySelector(`#${cancel.dataset.confirmCancel}`); if (f) f.hidden = true; }
      });
      const refresh = () => navigate(address, { replace: true });
      root.querySelectorAll('[data-block]').forEach((form) => bindForm(form, async () => {
        const result = await api.post(`/admin/users/${form.dataset.block}/block`, { action: form.dataset.action });
        flash('success', result.message);
        await refresh();
      }));
      root.querySelectorAll('[data-role]').forEach((form) => bindForm(form, async (data) => {
        const result = await api.post(`/admin/users/${form.dataset.role}/role`, data);
        flash('success', result.message);
        await refresh();
      }));
      bindForm(root.querySelector('#create-form'), async (data) => {
        const result = await api.post('/admin/users', data);
        flash('success', result.message);
        await refresh();
      });
    }
  };
}
