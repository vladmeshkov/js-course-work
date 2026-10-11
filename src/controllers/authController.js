import { ValidationError } from '../lib/errors.js';
import * as authService from '../services/authService.js';
import * as auditService from '../services/auditService.js';
import * as notificationService from '../services/notificationService.js';
import * as twoFactorService from '../services/twoFactorService.js';
import * as userModel from '../models/userModel.js';
import { config } from '../config/index.js';

export function showLogin(req, res) {
  res.render('pages/auth/login', { title: 'Вход', form: {}, errors: {} });
}

/** Завершает вход: новый идентификатор сессии защищает от фиксации сессии. */
async function completeLogin(req, res, user, returnTo) {
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  await notificationService.notify(user.id, { type: 'security', title: 'Вход в кабинет', body: `Адрес ${req.ip}. Если это были не вы, смените пароль.`, link: '/security' });
  res.redirect(returnTo || '/');
}

export async function login(req, res) {
  try {
    const user = await authService.login(req.body.login, req.body.password, req.ip);
    const returnTo = req.session.returnTo;
    if (user.totp_enabled) {
      // пароль верный, нужен второй фактор: пользователь пока не авторизован
      req.session.pending2fa = { userId: user.id, returnTo, attempts: 0, at: Date.now() };
      return res.redirect('/login/2fa');
    }
    await completeLogin(req, res, user, returnTo);
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).render('pages/auth/login', {
        title: 'Вход', form: { login: req.body.login }, errors: { common: error.message }
      });
    }
    throw error;
  }
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

export function show2fa(req, res) {
  if (!pending(req)) return res.redirect('/login');
  res.render('pages/auth/two-factor', { title: 'Код подтверждения', error: null });
}

export async function verify2fa(req, res) {
  const p = pending(req);
  if (!p) return res.redirect('/login');
  if (await twoFactorService.verifyLogin(p.userId, req.body.code)) {
    const user = await userModel.findById(p.userId);
    delete req.session.pending2fa;
    await auditService.log({ userId: user.id, action: 'auth.2fa', ip: req.ip });
    return completeLogin(req, res, user, p.returnTo);
  }
  p.attempts += 1;
  await auditService.log({ userId: p.userId, action: 'auth.2fa', result: 'failure', ip: req.ip });
  await userModel.registerFailedLogin(p.userId, config.login.maxAttempts, config.login.lockMinutes);
  if (p.attempts >= MAX_2FA_ATTEMPTS) {
    delete req.session.pending2fa;
    return res.status(429).render('pages/auth/login', { title: 'Вход', form: {}, errors: { common: 'Слишком много неверных кодов. Войдите заново' } });
  }
  req.session.pending2fa = p;
  res.status(401).render('pages/auth/two-factor', { title: 'Код подтверждения', error: `Неверный код. Осталось попыток: ${MAX_2FA_ATTEMPTS - p.attempts}` });
}

export async function logout(req, res) {
  const userId = req.session.userId;
  await auditService.log({ userId, action: 'auth.logout', ip: req.ip });
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/');
  });
}

export function showRegister(req, res) {
  res.render('pages/auth/register', { title: 'Стать клиентом', form: {}, errors: {} });
}

export async function register(req, res) {
  try {
    await authService.register(req.body, req.ip);
  } catch (error) {
    if (error instanceof ValidationError) {
      const { password, passwordRepeat, ...form } = req.body;
      return res.status(422).render('pages/auth/register', { title: 'Стать клиентом', form, errors: error.fields });
    }
    throw error;
  }
  req.flash('success', 'Заявка принята. После проверки анкеты сотрудником банка вам откроют счёт. Войдите, чтобы следить за статусом.');
  res.redirect('/login');
}
