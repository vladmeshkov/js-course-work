import request from 'supertest';

/**
 * Клиент JSON API для тестов: хранит cookie сессии и токен CSRF, который сервер отдаёт в GET /api/session.
 * Пути указываются без префикса /api: client.post('/login', { login, password }).
 */
export function apiClient(app) {
  const agent = request.agent(app);
  let token = '';
  const refresh = async () => {
    token = (await agent.get('/api/session')).body.csrfToken;
    return token;
  };
  const client = {
    agent,
    refresh,
    get: (url) => agent.get(`/api${url}`),
    post: (url, body = {}) => agent.post(`/api${url}`).set('X-CSRF-Token', token).send(body),
    put: (url, body = {}) => agent.put(`/api${url}`).set('X-CSRF-Token', token).send(body),
    /** Запрос без токена CSRF (для проверки защиты). */
    postWithoutToken: (url, body = {}) => agent.post(`/api${url}`).send(body),
    session: async () => (await agent.get('/api/session')).body,
    /** Вход по логину и паролю. После входа токен обновляется. */
    async login(login, password) {
      const res = await client.post('/login', { login, password });
      await refresh();
      return res;
    }
  };
  return client;
}

/** Клиент API, уже вошедший в систему. */
export async function loggedIn(app, login, password = 'Parol2026') {
  const client = apiClient(app);
  await client.refresh();
  const res = await client.login(login, password);
  if (res.status !== 200) throw new Error(`Не удалось войти как ${login}: ${res.status} ${JSON.stringify(res.body)}`);
  return client;
}
