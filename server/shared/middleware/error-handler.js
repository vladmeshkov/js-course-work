import { AppError, NotFoundError } from '../errors.js';
import { config } from '../../config/index.js';

export function notFound(req, res, next) {
  next(new NotFoundError('Метод API не найден'));
}

/** Ошибки API отдаются как JSON: { error: { message, code, fields? } }. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // ответ уже ушёл (например, сессия не сохранилась после res.json): только записать ошибку
  if (res.headersSent) { console.error(error); return; }
  if (error.type === 'entity.parse.failed') error = new AppError('Некорректный формат запроса', 400, 'bad_request');
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  if (!known) console.error(error);
  res.status(status).json({
    error: {
      message: known ? error.message : 'Внутренняя ошибка сервера. Попробуйте позже',
      code: known ? error.code : 'server_error',
      ...(known && error.fields ? { fields: error.fields } : {}),
      ...(!known && config.debug ? { details: error.stack } : {})
    }
  });
}
