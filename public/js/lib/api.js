// Обращения к JSON API сервера. Токен CSRF приходит от GET /api/session и отправляется в заголовке запросов, меняющих данные.

let csrfToken = '';

export function setCsrfToken(token) {
  csrfToken = token;
}

/** Ошибка API: status, code и fields (сообщения по полям формы). */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Не удалось выполнить запрос');
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'error';
    this.fields = body?.error?.fields ?? {};
  }
}

async function request(method, url, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  let response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: { message: 'Нет связи с сервером. Проверьте подключение и повторите', code: 'network' } });
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ответ не JSON */ }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

/** Строка запроса из объекта параметров (пустые значения пропускаются). */
export function query(params = {}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') q.set(key, value);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (url, params) => request('GET', `/api${url}${query(params)}`),
  post: (url, body = {}) => request('POST', `/api${url}`, body),
  put: (url, body = {}) => request('PUT', `/api${url}`, body),
  delete: (url) => request('DELETE', `/api${url}`)
};
