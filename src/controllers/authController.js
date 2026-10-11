import { ValidationError } from '../lib/errors.js';
import * as authService from '../services/authService.js';
import * as auditService from '../services/auditService.js';

export function showLogin(req, res) {
  res.render('pages/auth/login', { title: 'Вход', form: {}, errors: {} });
}

export async function login(req, res) {
  try {
    const user = await authService.login(req.body.login, req.body.password, req.ip);
    // новый идентификатор сессии после входа защищает от фиксации сессии
    const returnTo = req.session.returnTo;
    await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.userId = user.id;
    res.redirect(returnTo || '/');
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).render('pages/auth/login', {
        title: 'Вход', form: { login: req.body.login }, errors: { common: error.message }
      });
    }
    throw error;
  }
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
