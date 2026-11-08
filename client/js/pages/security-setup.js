import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, crumbs, errorSlot, formError, flash } from '../lib/ui.js';

/** Настройка двухфакторной защиты: QR-код и подтверждение кодом. Выглядит так же при обязательной настройке для сотрудников. */
export default async function page({ navigate, refreshSession, session }) {
  if (session.user.totpEnabled) return { redirect: '/security' };
  const setup = await api.get('/security/2fa/setup');
  return {
    title: 'Включить двухфакторную защиту',
    body: html`${crumbs([['Безопасность', '/security'], 'Включение'])}
<h1>Включить двухфакторную защиту</h1>
<section class="row">
  <div class="tile grow">
    <h2 class="mb10">1. Добавьте аккаунт в приложение</h2>
    <p class="muted">Отсканируйте QR-код приложением-аутентификатором или введите ключ вручную.</p>
    <div class="qr" role="img" aria-label="QR-код для приложения-аутентификатора">${raw(setup.qrSvg)}</div>
    <p class="small muted2 mt10 m0">Ключ вручную:</p>
    <p class="secret">${setup.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
  </div>
  <form class="tile form grow" id="setup-form" novalidate>
    <h2>2. Введите код</h2>
    <p class="muted m0">Приложение покажет шестизначный код. Введите его, чтобы подтвердить настройку.</p>
    <div class="field"><label for="code">Код из приложения</label><input id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="otp-input">${errorSlot('code')}</div>
    ${formError()}
    <div><button class="btn btn--lg" type="submit">Включить</button></div>
  </form>
</section>`,
    mount(root) {
      bindForm(root.querySelector('#setup-form'), async (data) => {
        const result = await api.post('/security/2fa/setup', data);
        await refreshSession();
        flash('success', result.message);
        await navigate('/security', { replace: true });
      });
    }
  };
}
