import { ForbiddenError } from '../lib/errors.js';
import * as userModel from '../models/userModel.js';
import { navFor } from '../lib/navigation.js';
import * as settingsModel from '../models/settingsModel.js';
import * as notificationService from '../services/notificationService.js';

/** Загружает пользователя сессии и кладёт его в req.user и в шаблоны. */
export async function loadUser(req, res, next) {
  req.user = null;
  if (req.session.userId) {
    const user = await userModel.findById(req.session.userId);
    if (user && user.status === 'active') req.user = user;
    else delete req.session.userId;
  }
  res.locals.user = req.user;
  res.locals.unread = req.user ? await notificationService.unreadCount(req.user.id) : 0;
  res.locals.nav = navFor(req.user);
  res.locals.can = (permission) => Boolean(req.user?.permissions.includes(permission));
  res.locals.currentPath = req.path;
  next();
}

const OPEN_FOR_SETUP = /^\/(security|logout|login|health|notifications)(\/|$)/;

/**
 * Сотрудник без двухфакторной защиты, когда она обязательна, может только настроить её и выйти.
 * Всё остальное перенаправляется на страницу настройки.
 */
export async function enforceStaff2fa(req, res, next) {
  const u = req.user;
  if (!u || u.role_code === 'client' || u.totp_enabled || OPEN_FOR_SETUP.test(req.path)) return next();
  if (!(await staff2faRequired())) return next();
  req.flash('info', 'Для сотрудников банка двухфакторная защита обязательна. Настройте её, чтобы продолжить работу.');
  res.redirect('/security/2fa/setup');
}

export async function staff2faRequired() {
  return (await settingsModel.getNumber('security.require_2fa_staff')) === 1;
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
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
