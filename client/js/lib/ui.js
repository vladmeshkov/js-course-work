// Общие помощники интерфейса: формы, сообщения, хлебные крошки.
import { html } from './html.js';
import { ApiError } from './api.js';
import * as motion from './motion.js';

/** Место под сообщение об ошибке поля: заполняется bindForm по ответу сервера. */
export function errorSlot(name) {
  return html`<span class="field__error" data-error="${name}" hidden></span>`;
}

/** Общее сообщение об ошибке формы (ошибки без привязки к полю). */
export function formError() {
  return html`<div class="alert alert--error" role="alert" data-form-error hidden></div>`;
}

/** Хлебные крошки: crumbs([['Главная', '/cabinet'], ['Платежи', '/payments'], 'Перевод']). Последний элемент без ссылки. */
export function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Навигационная цепочка">${items.map((item, i) => [
    i ? html` &nbsp;›&nbsp; ` : '',
    Array.isArray(item) ? html`<a href="${item[1]}">${item[0]}</a>` : item
  ])}</nav>`;
}

/** Собирает значения полей формы: флажок даёт 'on' (если выбран), у переключателей берётся выбранное значение. */
function formData(form) {
  const data = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (typeof value === 'string') data[name] = value;
  }
  return data;
}

function clearErrors(form) {
  form.querySelectorAll('[data-error]').forEach((el) => { el.hidden = true; el.textContent = ''; });
  form.querySelectorAll('.field--error, .xfer__box--error').forEach((el) => el.classList.remove('field--error', 'xfer__box--error'));
  const common = form.querySelector('[data-form-error]');
  if (common) { common.hidden = true; common.textContent = ''; }
}

/** Показывает ошибки полей (fields) и общую ошибку (message) в форме. */
export function showErrors(form, error) {
  clearErrors(form);
  const fields = error.fields ?? {};
  let rest = !Object.keys(fields).length;
  for (const [name, message] of Object.entries(fields)) {
    const slot = form.querySelector(`[data-error="${name}"]`);
    if (!slot) { rest = true; continue; }
    slot.textContent = message;
    slot.hidden = false;
    const box = slot.closest('.field, .xfer__box') ?? form.querySelector(`[name="${name}"]`)?.closest('.field, .xfer__box');
    if (box) box.classList.add(box.classList.contains('xfer__box') ? 'xfer__box--error' : 'field--error');
  }
  const common = form.querySelector('[data-form-error]');
  if (common && (rest || !Object.keys(fields).length)) {
    common.textContent = error.fields?.common ?? error.message;
    common.hidden = false;
    return;
  }
  if (!common && rest) showAlert(form.closest('main') ?? form.parentElement, 'error', error.message);
  // фокус на первое поле с ошибкой
  form.querySelector('[data-error]:not([hidden])')?.closest('.field, .xfer__box')?.querySelector('input, select, textarea')?.focus();
}

/**
 * Подключает отправку формы через API. handler(data, form, submitter) вызывается с собранными значениями;
 * ошибки ApiError показываются в форме. Повторная отправка блокируется, пока идёт запрос (защита от двойного платежа).
 *
 * Необратимое действие: атрибут data-confirm="Закрыть карту?" у формы. Первое нажатие показывает строку
 * подтверждения с кнопками «Да» и «Отмена», запрос уходит только после «Да».
 *
 * Сессия: при ответе csrf токен обновляется (повторное нажатие пройдёт), при unauthorized приложение
 * ведёт на вход (событие session-lost обрабатывает маршрутизатор).
 */
export function bindForm(form, handler) {
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.sending) return;
    const button = event.submitter ?? form.querySelector('button[type="submit"], button:not([type])');
    if (form.dataset.confirm && !button?.hasAttribute('data-confirm-yes')) {
      askConfirm(form, button);
      return;
    }
    form.querySelector('.confirm-bar')?.remove();
    form.dataset.sending = '1';
    button?.classList.add('is-loading');
    motion.busy();
    clearErrors(form);
    try {
      await handler(formData(form), form, button);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.code === 'csrf' || error.code === 'unauthorized') {
        window.dispatchEvent(new CustomEvent('session-lost', { detail: { code: error.code } }));
      }
      if (error.code !== 'unauthorized') showErrors(form, error);
    } finally {
      delete form.dataset.sending;
      button?.classList.remove('is-loading');
      motion.done();
    }
  });
}

/** Строка подтверждения необратимого действия внутри формы. */
function askConfirm(form, button) {
  if (form.querySelector('.confirm-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  bar.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = form.dataset.confirm;
  const yes = document.createElement('button');
  yes.type = 'submit';
  yes.className = 'btn btn--small btn--danger';
  yes.dataset.confirmYes = '';
  // значение нажатой кнопки (например, decision) передаётся дальше вместе с подтверждением
  if (button?.name) { yes.name = button.name; yes.value = button.value; }
  yes.textContent = 'Да, подтверждаю';
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'btn btn--ghost btn--small';
  no.textContent = 'Отмена';
  no.addEventListener('click', () => { bar.remove(); button?.focus(); });
  bar.append(text, yes, no);
  form.append(bar);
  yes.focus();
}

/** Сообщение в начале страницы (container – элемент страницы, по умолчанию #content). */
export function showAlert(container, type, message) {
  const root = container ?? document.getElementById('content');
  root.querySelector(':scope > .alert[data-flash]')?.remove();
  const box = document.createElement('div');
  box.className = `alert alert--${type}`;
  box.setAttribute('role', type === 'error' ? 'alert' : 'status');
  box.dataset.flash = '1';
  box.textContent = message;
  root.prepend(box);
  box.scrollIntoView({ block: 'nearest' });
}

const FLASH_KEY = 'flash';

/** Сообщение, которое покажется на следующей открытой странице (после перехода). */
export function flash(type, message) {
  try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type, message })); } catch { /* без хранилища сообщение не покажется */ }
}

/** Забирает отложенное сообщение. */
export function takeFlash() {
  try {
    const value = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

/** Привязывает к кнопкам [data-print] печать страницы. */
export function bindPrint(root) {
  root.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));
}
