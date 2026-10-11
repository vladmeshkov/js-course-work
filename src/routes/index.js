import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import * as home from '../controllers/homeController.js';
import * as auth from '../controllers/authController.js';
import * as cabinet from '../controllers/cabinetController.js';

const router = Router();

// ограничение частоты попыток входа с одного адреса
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false });

router.get('/', home.home);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/login', auth.showLogin);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', auth.logout);
router.get('/register', auth.showRegister);
router.post('/register', auth.register);

// разделы, которые будут реализованы по мере разработки модулей
for (const [path, title] of [['/accounts', 'Счета и карты'], ['/payments', 'Платежи и переводы'], ['/deposits', 'Вклады'], ['/loans', 'Кредиты'], ['/rates', 'Курсы валют']]) {
  router.get(path, (req, res) => res.render('pages/soon', { title }));
}

router.get('/cabinet', requireAuth, cabinet.cabinet);
router.get('/workplace', requireStaff, cabinet.workplace);

export default router;
