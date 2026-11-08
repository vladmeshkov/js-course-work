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
export function formData(form) {
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
 * Подключает отправку формы через API. handler(data, form) вызывается с собранными значениями; ошибки ApiError показываются в форме.
 * Повторная отправка блокируется, пока идёт запрос (защита от двойного платежа).
 */
export function bindForm(form, handler) {
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.sending) return;
    form.dataset.sending = '1';
    const button = event.submitter ?? form.querySelector('button[type="submit"], button:not([type])');
    button?.classList.add('is-loading');
    motion.busy();
    clearErrors(form);
    try {
      await handler(formData(form), form);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      showErrors(form, error);
    } finally {
      delete form.dataset.sending;
      button?.classList.remove('is-loading');
      motion.done();
    }
  });
}

/** Сообщение в начале страницы (container — элемент страницы, по умолчанию #content). */
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
