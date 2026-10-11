import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';

/**
 * CSRF-защита: токен хранится в сессии и приходит в скрытом поле _csrf каждой формы.
 * Проверяются все запросы, кроме GET, HEAD и OPTIONS.
 */
export function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = String(req.body?._csrf ?? req.get('x-csrf-token') ?? '');
  const expected = req.session.csrfToken;
  const ok = sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) throw new AppError('Форма устарела. Обновите страницу и повторите действие', 403, 'csrf');
  next();
}
