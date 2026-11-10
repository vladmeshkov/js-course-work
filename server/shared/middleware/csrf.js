import crypto from 'node:crypto';
import { AppError } from '../errors.js';

/** Новый случайный токен CSRF. */
export const newCsrfToken = () => crypto.randomBytes(24).toString('hex');

/**
 * CSRF-защита: токен хранится в сессии, клиент получает его от GET /api/session и присылает в заголовке X-CSRF-Token
 * с каждым запросом, который меняет данные. Проверяются все запросы, кроме GET, HEAD и OPTIONS.
 * Токен создаёт только GET /api/session, поэтому запросы гостя к другим адресам (курсы валют) не создают сессий.
 */
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String(req.get('x-csrf-token') ?? ''));
  const expected = Buffer.from(String(req.session.csrfToken ?? ''));
  // сравниваются байты, а не символы: иначе строка с не-ASCII символами той же длины роняла бы timingSafeEqual
  const ok = expected.length > 0 && sent.length === expected.length && crypto.timingSafeEqual(sent, expected);
  if (!ok) throw new AppError('Страница устарела. Обновите её и повторите действие', 403, 'csrf');
  next();
}
