import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash, showAlert } from '../lib/ui.js';

export default async function page({ session, navigate, refreshSession }) {
  const { locked, recoveryCodes, left, mail } = await api.get('/security');
  const user = session.user;
  return {
    title: 'Безопасность',
    body: html`<h1>Безопасность</h1>
${recoveryCodes ? html`<section class="tile tile--soft">
  <h2 class="mb10">Резервные коды</h2>
  <p class="m0 mb10">Сохраните их в надёжном месте. Каждый код подходит один раз, если не будет доступа к приложению. Больше они показаны не будут.</p>
  <div class="codes">${recoveryCodes.map((c) => html`<span>${c}</span>`)}</div>
</section>` : ''}
<section class="tile">
  <div class="between">
    <div><h2>Двухфакторная защита</h2><p class="muted m0">При входе кроме пароля нужен код из приложения-аутентификатора (Google Authenticator, Яндекс Ключ, Aegis и др.).</p></div>
    <span class="${user.totpEnabled ? 'text-good' : 'muted2'}"><b>${user.totpEnabled ? 'Включена' : 'Выключена'}</b></span>
  </div>
  ${!user.totpEnabled
    ? html`<div class="mt10"><a class="btn" href="/security/2fa/setup">Включить</a></div>`
    : html`<p class="muted2 small">Неиспользованных резервных кодов: ${left}</p>
      ${locked
        ? html`<div class="alert alert--info mt10">Для сотрудников банка двухфакторная защита обязательна, отключить её нельзя.</div>`
        : html`<form class="form w420" id="disable-form" novalidate>
      <h2>Отключить</h2>
      <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password">${errorSlot('password')}</div>
      <div class="field"><label for="code">Код из приложения</label><input id="code" name="code" autocomplete="one-time-code" maxlength="12">${errorSlot('code')}</div>
      ${formError()}
      <div><button class="btn btn--ghost text-bad" type="submit">Отключить защиту</button></div>
    </form>`}`}
</section>
${user.roleCode === 'client' ? html`<section class="panel">
  <h2>Письма на почту</h2>
  ${!mail.enabled
    ? html`<p class="muted m0">Отправка писем в этой установке не настроена: коды подтверждения показываются на странице. Администратор включает почту параметрами SMTP в настройках сервера.</p>`
    : !mail.email
      ? html`<p class="muted m0">В вашей анкете не указана электронная почта, поэтому письма отправлять некуда.</p>`
      : html`<p class="muted m0">Коды подтверждения операций приходят на адрес <b>${mail.email}</b>. Остальные уведомления можно дублировать на почту.</p>
    <form class="switch-row" id="email-form">
      <span><b>Дублировать уведомления на почту</b><small>Платежи, переводы, решения по заявкам, напоминания</small></span>
      <span class="switch"><input type="checkbox" name="enabled" role="switch"${user.notifyEmail ? ' checked' : ''}><i></i></span>
    </form>`}
</section>` : ''}`,
    mount(root) {
      bindForm(root.querySelector('#disable-form'), async (data) => {
        const result = await api.post('/security/2fa/disable', data);
        await refreshSession();
        flash('success', result.message);
        await navigate('/security', { replace: true });
      });
      const email = root.querySelector('#email-form');
      email?.querySelector('input').addEventListener('change', async (event) => {
        const result = await api.post('/security/email', { enabled: event.target.checked });
        await refreshSession();
        showAlert(root, 'success', result.message);
      });
    }
  };
}
