import { AppError, ForbiddenError } from '../lib/errors.js';
import * as userModel from '../models/userModel.js';
import * as settingsModel from '../models/settingsModel.js';

/** Загружает пользователя сессии в req.user. */
export async function loadUser(req, res, next) {
  req.user = null;
  if (req.session.userId) {
    const user = await userModel.findById(req.session.userId);
    if (user && user.status === 'active') req.user = user;
    else delete req.session.userId;
  }
  next();
}

const OPEN_FOR_SETUP = /^\/(session|security|logout|login|health|notifications)(\/|$)/;

/**
 * Сотрудник без двухфакторной защиты, когда она обязательна, может только настроить её и выйти.
 * Остальные запросы получают ошибку staff_2fa_required, по ней клиент открывает страницу настройки.
 */
export async function enforceStaff2fa(req, res, next) {
  const u = req.user;
  if (!u || u.role_code === 'client' || u.totp_enabled || OPEN_FOR_SETUP.test(req.path)) return next();
  if (!(await staff2faRequired())) return next();
  throw new AppError('Для сотрудников банка двухфакторная защита обязательна. Настройте её, чтобы продолжить работу.', 403, 'staff_2fa_required');
}

export async function staff2faRequired() {
  return (await settingsModel.getNumber('security.require_2fa_staff')) === 1;
}

export function requireAuth(req, res, next) {
  if (!req.user) throw new AppError('Войдите в кабинет', 401, 'unauthorized');
  next();
}

/** Маршрут проверяет право, а не название роли. */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (!req.user.permissions.includes(permission)) throw new ForbiddenError();
    next();
  };
}

/** Только сотрудники банка (любая роль, кроме клиента). */
export function requireStaff(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.role_code === 'client') throw new ForbiddenError();
  next();
}

/** Только клиент банка. */
export function requireClient(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  next();
}
