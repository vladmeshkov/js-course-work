import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';

/**
 * CSRF-защита: токен хранится в сессии, клиент получает его от GET /api/session и присылает в заголовке X-CSRF-Token
 * с каждым запросом, который меняет данные. Проверяются все запросы, кроме GET, HEAD и OPTIONS.
 */
export function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = String(req.get('x-csrf-token') ?? '');
  const expected = req.session.csrfToken;
  const ok = sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) throw new AppError('Страница устарела. Обновите её и повторите действие', 403, 'csrf');
  next();
}
