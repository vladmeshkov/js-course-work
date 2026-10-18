import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { requireAuth, requireClient, requireStaff } from '../middleware/auth.js';
import * as session from '../controllers/sessionController.js';
import * as home from '../controllers/homeController.js';
import * as auth from '../controllers/authController.js';
import * as cabinet from '../controllers/cabinetController.js';
import * as security from '../controllers/securityController.js';
import * as rates from '../controllers/ratesController.js';

const router = Router();

// ограничение частоты попыток входа с одного адреса
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false });

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/session', session.get);

router.get('/home', home.home);
router.get('/info/:slug', home.info);
router.get('/search/index', home.searchIndex);

router.post('/login', loginLimiter, auth.login);
router.get('/login/2fa', auth.pending2fa);
router.post('/login/2fa', loginLimiter, auth.verify2fa);
router.post('/logout', auth.logout);
router.get('/welcome', requireAuth, auth.welcome);
router.post('/register', auth.register);

router.get('/rates', rates.index);
router.get('/rates/convert', rates.convert);

router.get('/security', requireAuth, security.show);
router.get('/security/2fa/setup', requireAuth, security.showSetup);
router.post('/security/2fa/setup', requireAuth, security.confirmSetup);
router.post('/security/email', requireAuth, security.setEmailNotifications);
router.post('/security/2fa/disable', requireAuth, security.disable);
router.get('/notifications', requireAuth, security.notifications);

router.get('/cabinet', requireClient, cabinet.cabinet);
router.get('/workplace', requireStaff, cabinet.workplace);

export default router;
