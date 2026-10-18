import * as clientModel from '../models/clientModel.js';
import { AppError } from '../lib/errors.js';
import * as authService from '../services/authService.js';
import * as auditService from '../services/auditService.js';
import * as notificationService from '../services/notificationService.js';
import * as twoFactorService from '../services/twoFactorService.js';
import * as userModel from '../models/userModel.js';
import { config } from '../config/index.js';

/**
 * Завершает вход: новый идентификатор сессии защищает от фиксации сессии.
 * Клиенту показывается экран «С возвращением» (время прошлого входа), сотрудники сразу идут на рабочее место.
 */
async function completeLogin(req, res, user) {
  const csrfToken = req.session.csrfToken;
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  req.session.csrfToken = csrfToken;
  await notificationService.notify(user.id, { type: 'security', title: 'Вход в кабинет', body: `Адрес ${req.ip}. Если это были не вы, смените пароль.`, link: '/security' });
  const isClient = user.role_code === 'client';
  if (isClient) req.session.welcome = { previous: user.last_login_at ? new Date(user.last_login_at).toISOString() : null };
  res.json({ status: 'ok', welcome: isClient, home: isClient ? '/cabinet' : '/workplace' });
}

/** Экран «С возвращением» после входа клиента: время прошлого входа. */
export async function welcome(req, res) {
  const w = req.session.welcome;
  delete req.session.welcome;
  const client = await clientModel.findByUserId(req.user.id);
  res.json({ shown: Boolean(w), name: client?.first_name ?? req.user.login, previous: w?.previous ?? null });
}

export async function login(req, res) {
  const user = await authService.login(req.body.login, req.body.password, req.ip);
  if (user.totp_enabled) {
    // пароль верный, нужен второй фактор: пользователь пока не авторизован
    req.session.pending2fa = { userId: user.id, previousLogin: user.last_login_at ? new Date(user.last_login_at).toISOString() : null, attempts: 0, at: Date.now() };
    return res.json({ status: '2fa' });
  }
  await completeLogin(req, res, user);
}

const PENDING_MINUTES = 5;
const MAX_2FA_ATTEMPTS = 5;

function pending(req) {
  const p = req.session.pending2fa;
  if (!p || Date.now() - p.at > PENDING_MINUTES * 60 * 1000) {
    delete req.session.pending2fa;
    return null;
  }
  return p;
}

export async function verify2fa(req, res) {
  const p = pending(req);
  if (!p) throw new AppError('Время подтверждения истекло. Войдите заново', 401, 'login_expired');
  if (await twoFactorService.verifyLogin(p.userId, req.body.code)) {
    const user = await userModel.findById(p.userId);
    delete req.session.pending2fa;
    await auditService.log({ userId: user.id, action: 'auth.2fa', ip: req.ip });
    return completeLogin(req, res, { ...user, last_login_at: p.previousLogin });
  }
  p.attempts += 1;
  await auditService.log({ userId: p.userId, action: 'auth.2fa', result: 'failure', ip: req.ip });
  await userModel.registerFailedLogin(p.userId, config.login.maxAttempts, config.login.lockMinutes);
  if (p.attempts >= MAX_2FA_ATTEMPTS) {
    delete req.session.pending2fa;
    throw new AppError('Слишком много неверных кодов. Войдите заново', 429, 'login_expired');
  }
  req.session.pending2fa = p;
  throw new AppError(`Неверный код. Осталось попыток: ${MAX_2FA_ATTEMPTS - p.attempts}`, 401, 'otp_wrong');
}

/** Есть ли незавершённый вход с вводом кода (клиент решает, показывать ли страницу ввода кода). */
export function pending2fa(req, res) {
  res.json({ pending: Boolean(pending(req)) });
}

export async function logout(req, res) {
  const userId = req.session.userId;
  await auditService.log({ userId, action: 'auth.logout', ip: req.ip });
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ status: 'ok' });
  });
}

export async function register(req, res) {
  await authService.register(req.body, req.ip);
  res.status(201).json({ status: 'ok', message: 'Заявка принята. После проверки анкеты сотрудником банка вам откроют счёт. Войдите, чтобы следить за статусом.' });
}
