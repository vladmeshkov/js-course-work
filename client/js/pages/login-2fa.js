import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, formError } from '../lib/ui.js';
import { takeReturn } from '../lib/router.js';

export default async function page({ navigate, refreshSession }) {
  const { pending } = await api.get('/login/2fa');
  if (!pending) return { redirect: '/login' };
  return {
    title: 'Код подтверждения',
    body: html`<section class="tile form w640">
  <h1>Код подтверждения</h1>
  <p class="muted m0">Введите шестизначный код из приложения-аутентификатора. Если телефона нет под рукой, введите резервный код.</p>
  <form class="form" id="code-form">
    <div class="field"><label for="code">Код</label><input id="code" name="code" autocomplete="one-time-code" inputmode="text" maxlength="12" autofocus class="otp-input"></div>
    ${formError()}
    <div class="actions"><button class="btn btn--lg" type="submit">Войти</button><a class="link" href="/login">Начать заново</a></div>
  </form>
</section>`,
    mount(root) {
      bindForm(root.querySelector('#code-form'), async (data) => {
        let result;
        try {
          result = await api.post('/login/2fa', data);
        } catch (error) {
          if (error.code === 'login_expired') return navigate('/login', { replace: true });
          throw error;
        }
        await refreshSession();
        const back = takeReturn();
        if (back) return navigate(back, { replace: true });
        return navigate(result.welcome ? '/welcome' : result.home, { replace: true });
      });
    }
  };
}
