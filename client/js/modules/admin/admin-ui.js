// Помощники страниц администрирования.

import { dateTime } from '../../lib/format.js';

/** Дата и время по Минску для таблиц администратора: «18.10.2026 14:05» (len 19: с секундами). */
export function stamp(value, len = 16) {
  return dateTime(value, { seconds: len > 16 });
}

/** Текущий адрес страницы без перезагрузки: используется при обновлении списка по фильтрам. */
export function replaceUrl(path, queryString) {
  history.replaceState(null, '', path + queryString);
}
