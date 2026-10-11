import { AppError, NotFoundError } from '../lib/errors.js';
import { config } from '../config/index.js';

export function notFound(req, res, next) {
  next(new NotFoundError());
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  if (!known) console.error(error);
  res.status(status).render('pages/errors/error', {
    title: status === 404 ? 'Страница не найдена' : 'Ошибка',
    status,
    message: known ? error.message : 'Внутренняя ошибка сервера. Попробуйте позже',
    details: !known && !config.isProd ? error.stack : null
  });
}
