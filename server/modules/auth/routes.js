import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config/index.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import * as auth from './auth.controller.js';
import * as security from './security.controller.js';
import * as session from './session.controller.js';

/** Сессия, вход, регистрация, безопасность (2FA, почта) и уведомления. Подключается под /api. */
const router = Router();

// ограничение частоты попыток входа с одного адреса
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false });

// регистрация: не больше 10 анкет в час с одного адреса (перебор номеров и нагрузка bcrypt)
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false });

router.get('/session', session.get);
router.post('/login', loginLimiter, auth.login);
router.get('/login/2fa', auth.pending2fa);
router.post('/login/2fa', loginLimiter, auth.verify2fa);
router.post('/logout', auth.logout);
router.get('/welcome', requireAuth, auth.welcome);
router.post('/register', registerLimiter, auth.register);
router.get('/security', requireAuth, security.show);
router.get('/security/2fa/setup', requireAuth, security.showSetup);
router.post('/security/2fa/setup', requireAuth, security.confirmSetup);
router.post('/security/email', requireAuth, security.setEmailNotifications);
router.post('/security/2fa/disable', requireAuth, security.disable);
router.get('/notifications', requireAuth, security.notifications);

export default router;
