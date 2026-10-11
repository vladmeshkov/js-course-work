import { AppError, ValidationError } from '../lib/errors.js';
import * as notificationService from '../services/notificationService.js';
import * as twoFactorService from '../services/twoFactorService.js';

export async function show(req, res) {
  const codes = req.session.recoveryCodes ?? null;
  delete req.session.recoveryCodes;
  res.render('pages/security/index', {
    title: 'Безопасность', recoveryCodes: codes, left: req.user.totp_enabled ? await twoFactorService.recoveryLeft(req.user.id) : 0, errors: {}
  });
}

export async function showSetup(req, res) {
  if (req.user.totp_enabled) return res.redirect('/security');
  let setup;
  if (req.session.pendingSecret) setup = await twoFactorService.qrFor(req.user, req.session.pendingSecret);
  else {
    setup = await twoFactorService.beginSetup(req.user);
    req.session.pendingSecret = setup.secret;
  }
  res.render('pages/security/setup', { title: 'Включить двухфакторную защиту', setup, errors: {} });
}

export async function confirmSetup(req, res) {
  const secret = req.session.pendingSecret;
  if (!secret) return res.redirect('/security/2fa/setup');
  try {
    req.session.recoveryCodes = await twoFactorService.confirmSetup(req.user, secret, req.body.code);
    delete req.session.pendingSecret;
    req.flash('success', 'Двухфакторная защита включена');
    res.redirect('/security');
  } catch (error) {
    if (error instanceof ValidationError) {
      const setup = await twoFactorService.qrFor(req.user, secret);
      return res.status(422).render('pages/security/setup', { title: 'Включить двухфакторную защиту', setup, errors: error.fields });
    }
    throw error;
  }
}

export async function disable(req, res) {
  try {
    await twoFactorService.disable(req.user, req.body.password, req.body.code);
    req.flash('success', 'Двухфакторная защита отключена');
    res.redirect('/security');
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).render('pages/security/index', { title: 'Безопасность', recoveryCodes: null, left: await twoFactorService.recoveryLeft(req.user.id), errors: error.fields });
    }
    if (error instanceof AppError && error.status < 500) {
      req.flash('error', error.message);
      return res.redirect('/security');
    }
    throw error;
  }
}

export async function notifications(req, res) {
  const items = await notificationService.list(req.user.id);
  // непрочитанные подсвечиваются на этой странице, после показа помечаются прочитанными
  await notificationService.markAllRead(req.user.id);
  res.render('pages/security/notifications', { title: 'Уведомления', items, unreadBefore: items.filter((n) => !n.read_at).length });
}
