import { AppError } from '../lib/errors.js';
import * as settingsModel from '../models/settingsModel.js';
import * as mailService from '../services/mailService.js';
import * as userModel from '../models/userModel.js';
import * as notificationService from '../services/notificationService.js';
import * as twoFactorService from '../services/twoFactorService.js';

/** Страница «Безопасность»: состояние двухфакторной защиты, резервные коды (один раз после включения), почта. */
export async function show(req, res) {
  const recoveryCodes = req.session.recoveryCodes ?? null;
  delete req.session.recoveryCodes;
  const locked = req.user.role_code !== 'client' && (await settingsModel.getNumber('security.require_2fa_staff')) === 1;
  const email = req.user.role_code === 'client' ? await mailService.emailOf(req.user.id) : null;
  res.json({
    locked, recoveryCodes,
    left: req.user.totp_enabled ? await twoFactorService.recoveryLeft(req.user.id) : 0,
    mail: { enabled: mailService.enabled(), email: email ? mailService.maskEmail(email) : null }
  });
}

export async function setEmailNotifications(req, res) {
  const enabled = req.body.enabled === true || req.body.enabled === 'on';
  await userModel.setNotifyEmail(req.user.id, enabled);
  res.json({ status: 'ok', enabled, message: enabled ? 'Уведомления будут дублироваться на почту' : 'Дублирование на почту отключено' });
}

/** Начало настройки: секрет и QR-код. Секрет живёт в сессии до подтверждения кодом. */
export async function showSetup(req, res) {
  if (req.user.totp_enabled) throw new AppError('Двухфакторная защита уже включена', 409, 'already_enabled');
  let setup;
  if (req.session.pendingSecret) setup = await twoFactorService.qrFor(req.user, req.session.pendingSecret);
  else {
    setup = await twoFactorService.beginSetup(req.user);
    req.session.pendingSecret = setup.secret;
  }
  res.json(setup);
}

export async function confirmSetup(req, res) {
  const secret = req.session.pendingSecret;
  if (!secret) throw new AppError('Начните настройку заново', 409, 'setup_expired');
  req.session.recoveryCodes = await twoFactorService.confirmSetup(req.user, secret, req.body.code);
  delete req.session.pendingSecret;
  res.json({ status: 'ok', message: 'Двухфакторная защита включена' });
}

export async function disable(req, res) {
  await twoFactorService.disable(req.user, req.body.password, req.body.code);
  res.json({ status: 'ok', message: 'Двухфакторная защита отключена' });
}

/** Список уведомлений. Непрочитанные отмечаются в ответе, после показа помечаются прочитанными. */
export async function notifications(req, res) {
  const items = await notificationService.list(req.user.id);
  await notificationService.markAllRead(req.user.id);
  res.json({ items, unreadBefore: items.filter((n) => !n.read_at).length });
}
