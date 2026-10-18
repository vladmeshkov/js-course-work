import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, flash } from '../lib/ui.js';
import { stamp } from '../lib/admin-ui.js';

export default async function page({ navigate, refreshSession }) {
  const { backups } = await api.get('/admin/backups');
  return {
    title: 'Резервные копии',
    body: html`<div class="between"><h1>Резервные копии</h1>
  <form id="create-form"><button class="btn" type="submit">Создать копию</button></form></div>
<section class="tile">
  <p class="muted m0 mb10">Копия делается утилитой mysqldump и шифруется ключом DATA_KEY. Автоматически создаётся по расписанию из настроек сервера.</p>
  ${backups.length ? '' : html`<p class="muted m0">Копий пока нет.</p>`}
  ${backups.map((b) => html`<div class="account">
      <div><div class="account__title">${b.name}</div><div class="account__iban">${stamp(b.createdAt)}, ${Math.max(1, Math.round(b.size / 1024))} КБ</div></div>
      <form class="actions" data-restore="${b.name}" novalidate>
        <input class="mini mini--wide" name="confirm" placeholder="Слово ВОССТАНОВИТЬ" aria-label="Подтверждение восстановления" autocomplete="off">
        <button class="btn btn--ghost btn--small text-bad" type="submit">Восстановить</button>${errorSlot('confirm')}</form>
    </div>`)}
  <div class="alert alert--info mt10">Восстановление заменяет все текущие данные данными из копии. Действие необратимо, перед ним создайте свежую копию.</div>
</section>`,
    mount(root) {
      bindForm(root.querySelector('#create-form'), async () => {
        const result = await api.post('/admin/backups');
        flash('success', result.message);
        await navigate('/admin/backups', { replace: true });
      });
      root.querySelectorAll('[data-restore]').forEach((form) => bindForm(form, async (data) => {
        const result = await api.post('/admin/backups/restore', { name: form.dataset.restore, confirm: data.confirm });
        await refreshSession();   // после восстановления сессия могла измениться
        flash('success', result.message);
        await navigate('/admin/backups', { replace: true });
      }));
    }
  };
}
