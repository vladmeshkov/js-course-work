import { navFor } from '../lib/navigation.js';
import * as notificationService from '../services/notificationService.js';

/** Состояние сессии для клиентской части: пользователь, меню, число непрочитанных уведомлений и токен CSRF. */
export async function get(req, res) {
  const u = req.user;
  res.json({
    csrfToken: req.session.csrfToken,
    user: u && {
      id: u.id, login: u.login, roleCode: u.role_code, roleName: u.role_name, permissions: u.permissions,
      totpEnabled: u.totp_enabled, notifyEmail: u.notify_email
    },
    nav: navFor(u),
    unread: u ? await notificationService.unreadCount(u.id) : 0
  });
}
