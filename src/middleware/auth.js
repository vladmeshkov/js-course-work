import { ForbiddenError } from '../lib/errors.js';
import * as userModel from '../models/userModel.js';
import { navFor } from '../lib/navigation.js';

/** Загружает пользователя сессии и кладёт его в req.user и в шаблоны. */
export async function loadUser(req, res, next) {
  req.user = null;
  if (req.session.userId) {
    const user = await userModel.findById(req.session.userId);
    if (user && user.status === 'active') req.user = user;
    else delete req.session.userId;
  }
  res.locals.user = req.user;
  res.locals.nav = navFor(req.user);
  res.locals.can = (permission) => Boolean(req.user?.permissions.includes(permission));
  res.locals.currentPath = req.path;
  next();
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
