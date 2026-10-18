// Помощники страниц администрирования.

/** Дата и время в UTC для таблиц администратора: «2026-10-18 14:05» (len 16) или с секундами (len 19). */
export function stamp(value, len = 16) {
  return new Date(value).toISOString().slice(0, len).replace('T', ' ');
}

/** Текущий адрес страницы без перезагрузки: используется при обновлении списка по фильтрам. */
export function replaceUrl(path, queryString) {
  history.replaceState(null, '', path + queryString);
}
