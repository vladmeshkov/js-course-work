/** Простые проверки полей форм. Каждая возвращает текст ошибки или null. */

export const rules = {
  required: (v) => (String(v ?? '').trim() ? null : 'Поле обязательно для заполнения'),
  login: (v) => (/^[a-z0-9._-]{3,32}$/.test(String(v ?? '')) ? null : 'От 3 до 32 символов: латинские строчные буквы, цифры, точка, дефис, подчёркивание'),
  password: (v) => {
    const s = String(v ?? '');
    if (s.length < 8) return 'Пароль должен быть не короче 8 символов';
    if (!/[A-Za-zА-Яа-я]/.test(s) || !/\d/.test(s)) return 'Пароль должен содержать буквы и цифры';
    return null;
  },
  phone: (v) => (/^\+375\d{9}$/.test(String(v ?? '').replace(/[\s()-]/g, '')) ? null : 'Телефон в формате +375291234567'),
  email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : 'Некорректный адрес электронной почты'),
  idNumber: (v) => (/^\d{7}[A-Z]\d{3}[A-Z]{2}\d$/.test(String(v ?? '').toUpperCase()) ? null : 'Идентификационный номер: 7 цифр, буква, 3 цифры, 2 буквы, цифра'),
  passport: (v) => (/^[A-Z]{2}\d{7}$/.test(String(v ?? '').toUpperCase()) ? null : 'Паспорт: две буквы и семь цифр, например MC1234567'),
  adult: (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return 'Укажите дату рождения';
    const limit = new Date();
    limit.setFullYear(limit.getFullYear() - 18);
    return d <= limit ? null : 'Услуги доступны с 18 лет';
  }
};

/**
 * Прогоняет значения через правила.
 * @param {Record<string, any>} values
 * @param {Record<string, Array<(v:any)=>string|null>>} schema
 * @returns {Record<string, string>} ошибки по полям (пусто, если всё верно)
 */
export function check(values, schema) {
  const errors = {};
  for (const [field, list] of Object.entries(schema)) {
    for (const rule of list) {
      const message = rule(values[field]);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}
