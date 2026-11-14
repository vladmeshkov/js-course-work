import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config/index.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import * as auth from './auth.controller.js';
import * as security from './security.controller.js';
import * as session from './session.controller.js';
import { AppError } from '../../shared/errors.js';

/** Сессия, вход, регистрация, безопасность (2FA, почта) и уведомления. Подключается под /api. */
const router = Router();

/**
 * Ограничение частоты запросов с одного адреса. Превышение отдаётся как обычная ошибка API (JSON с текстом
 * на русском), иначе библиотека отвечает английским текстом и интерфейс показывает только «Не удалось выполнить запрос».
 * @param {number} windowMs окно, мс
 * @param {number} limit запросов в окне
 * @param {string} message текст для пользователя
 * @param {{ skip?: () => boolean }} [options]
 */
export function limiter(windowMs, limit, message, { skip = () => config.isTest } = {}) {
  return rateLimit({
    windowMs, limit, skip, standardHeaders: true, legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(message, 429, 'rate_limited'))
  });
}

// ограничение частоты попыток входа с одного адреса
const loginLimiter = limiter(15 * 60 * 1000, 30, 'Слишком много попыток входа с вашего адреса. Повторите через 15 минут');

// регистрация: не больше 10 анкет в час с одного адреса (перебор номеров и нагрузка bcrypt)
const registerLimiter = limiter(60 * 60 * 1000, 10, 'Слишком много заявок с вашего адреса. Повторите через час');

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
