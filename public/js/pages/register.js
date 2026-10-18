import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { bindForm, errorSlot, formError, flash } from '../lib/ui.js';

function field(name, label, { type = 'text', hint = '', autocomplete = '' } = {}) {
  return html`<div class="field">
    <label for="${name}">${label}</label>
    <input id="${name}" name="${name}" type="${type}"${autocomplete ? html` autocomplete="${autocomplete}"` : ''}>
    ${hint ? html`<span class="field__hint">${hint}</span>` : ''}
    ${errorSlot(name)}
  </div>`;
}

export default async function page({ navigate }) {
  return {
    title: 'Стать клиентом',
    body: html`<h1>Стать клиентом</h1>
<p class="muted m0 measure">Заполните анкету. Сотрудник банка проверит данные, после этого вам откроют первый счёт.</p>
<form class="tile form" id="register-form" novalidate>
  <h2>Личные данные</h2>
  <div class="form-grid">
    ${field('lastName', 'Фамилия')}
    ${field('firstName', 'Имя')}
    ${field('patronymic', 'Отчество')}
    ${field('birthDate', 'Дата рождения', { type: 'date' })}
    ${field('idNumber', 'Идентификационный номер', { hint: 'Из паспорта, например 3010590A001PB4' })}
    ${field('passport', 'Серия и номер паспорта', { hint: 'Например MC1234567' })}
    ${field('phone', 'Телефон', { type: 'tel', hint: '+375291234567' })}
    ${field('email', 'Электронная почта', { type: 'email' })}
  </div>
  <h2 class="mt10">Доступ в кабинет</h2>
  <div class="form-grid">
    ${field('login', 'Логин', { autocomplete: 'username', hint: 'Латинские буквы, цифры, точка, дефис' })}
    ${field('password', 'Пароль', { type: 'password', autocomplete: 'new-password', hint: 'Не короче 8 символов, буквы и цифры' })}
    ${field('passwordRepeat', 'Повторите пароль', { type: 'password', autocomplete: 'new-password' })}
  </div>
  ${formError()}
  <div><button class="btn btn--lg" type="submit">Отправить заявку</button></div>
</form>`,
    mount(root) {
      bindForm(root.querySelector('#register-form'), async (data) => {
        const result = await api.post('/register', data);
        flash('success', result.message);
        await navigate('/login');
      });
    }
  };
}
