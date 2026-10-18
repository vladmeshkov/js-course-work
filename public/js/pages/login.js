import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, formError } from '../lib/ui.js';
import { takeReturn } from '../lib/router.js';

export default async function page({ navigate, refreshSession, session }) {
  if (session.user) return { redirect: session.user.roleCode === 'client' ? '/cabinet' : '/workplace' };
  return {
    title: 'Вход',
    body: html`<section class="auth">
  <div class="auth__side">
    <div class="auth__top">
      <a class="logo logo--lg" href="/">
        <img src="/img/emblem.png" alt="Эмблема ТалерБанка: оранжевый круг с монограммой Тр" width="60" height="60">
        <span>Талер<span class="logo__bank">Банк</span></span>
      </a>
      <div>
        <h1>Ваши финансы под надёжной защитой</h1>
        <p class="auth__lead">Современный банк для ваших целей</p>
      </div>
    </div>
    <img class="auth__coin" src="/img/coin.png" alt="" width="540">
    <div class="auth__links">
      <a href="/loans"><span class="auth__ico">Кр</span><span><b>Кредиты</b><small>На любые цели</small></span></a>
      <a href="/deposits"><span class="auth__ico">%</span><span><b>Вклады</b><small>Стабильный доход</small></span></a>
    </div>
  </div>
  <div class="auth__panel">
    <div class="auth__card">
      <h2>Вход в интернет-банк</h2>
      <p class="muted mb20">Управляйте своими финансами в любое время и в любом месте</p>
      <form class="form" id="login-form">
        <div class="field">
          <label for="login">Логин</label>
          <input id="login" name="login" autocomplete="username" required autofocus>
        </div>
        <div class="field">
          <div class="field__row"><label for="password">Пароль</label><button class="link-btn" type="button" id="pw-toggle" aria-controls="password">Показать</button></div>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
        </div>
        ${formError()}
        <button class="btn btn--lg" type="submit">Войти &nbsp;→</button>
        <div class="auth__row"><a class="link" href="/forgot">Забыли пароль?</a><a class="link" href="/register">Стать клиентом</a></div>
        <a class="auth__guest" href="/">Продолжить как гость &nbsp;→</a>
      </form>
    </div>
  </div>
</section>
<p class="auth__note">Банк никогда не просит назвать код из письма или пароль по телефону.</p>`,
    mount(root) {
      const input = root.querySelector('#password');
      const toggle = root.querySelector('#pw-toggle');
      toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Скрыть' : 'Показать';
      });
      bindForm(root.querySelector('#login-form'), async (data) => {
        const result = await api.post('/login', data);
        if (result.status === '2fa') return navigate('/login/2fa');
        await refreshSession();
        const back = takeReturn();
        if (back) return navigate(back, { replace: true });
        return navigate(result.welcome ? '/welcome' : result.home, { replace: true });
      });
    }
  };
}
