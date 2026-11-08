// Форма с несколькими кнопками решения («Подтвердить» / «Отклонить», «Заблокировать» / «Разблокировать»).
// FormData не знает, какая кнопка нажата, поэтому выбор запоминается по клику (клик происходит раньше отправки формы).
import { bindForm } from './ui.js';

/**
 * Подключает форму через bindForm; handler(data, choice, form) получает значение data-choice нажатой кнопки.
 * При отправке клавишей Enter браузер «нажимает» первую кнопку формы, поэтому выбор по умолчанию берётся с неё.
 */
export function bindChoiceForm(form, handler) {
  if (!form) return;
  const buttons = [...form.querySelectorAll('button[data-choice]')];
  let choice = buttons[0]?.dataset.choice;
  buttons.forEach((button) => button.addEventListener('click', () => { choice = button.dataset.choice; }));
  bindForm(form, (data) => handler(data, choice, form));
}
