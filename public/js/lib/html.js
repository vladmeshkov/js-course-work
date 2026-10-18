// Шаблоны страниц без шаблонизатора: теговый шаблон html`...` экранирует все подставляемые значения.
// Готовую разметку (результат другого html``) подставлять можно: она не экранируется повторно.
// Нужна «сырая» строка (например, SVG от сервера): raw(строка).

class Markup {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирует текст для HTML и атрибутов. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

/** Теговый шаблон: html`<p>${text}</p>`. Массивы склеиваются, null, undefined и false дают пустую строку. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Markup(out);
}

/** Вставляет строку как готовую разметку без экранирования (только для доверенных данных). */
export function raw(text) {
  return new Markup(String(text ?? ''));
}
