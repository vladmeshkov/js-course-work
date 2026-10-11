import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { requireAuth, requireStaff, requirePermission } from '../middleware/auth.js';
import * as home from '../controllers/homeController.js';
import * as auth from '../controllers/authController.js';
import * as cabinet from '../controllers/cabinetController.js';
import * as accounts from '../controllers/accountsController.js';
import * as transfers from '../controllers/transferController.js';
import * as deposits from '../controllers/depositController.js';
import * as admin from '../controllers/adminController.js';

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
for (const [path, title] of [['/loans', 'Кредиты'], ['/rates', 'Курсы валют']]) {
  router.get(path, (req, res) => res.render('pages/soon', { title }));
}

router.get('/payments', requireAuth, (req, res) => res.render('pages/payments/hub', { title: 'Платежи и переводы' }));
router.get('/accounts', requireAuth, accounts.list);
router.get('/accounts/:id', requireAuth, accounts.show);

router.get('/transfers/new', requireAuth, transfers.showForm);
router.post('/transfers', requireAuth, transfers.submit);
router.get('/transfers/:id/confirm', requireAuth, transfers.showConfirm);
router.post('/transfers/:id/confirm', requireAuth, transfers.confirm);
router.post('/transfers/:id/cancel', requireAuth, transfers.cancel);

router.get('/deposits', deposits.index);
router.get('/deposits/calc', deposits.calc);
router.get('/deposits/new', requireAuth, deposits.showNew);
router.post('/deposits', requireAuth, deposits.create);
router.get('/deposits/:id', requireAuth, deposits.show);
router.get('/deposits/:id/close', requireAuth, deposits.showClose);
router.post('/deposits/:id/close', requireAuth, deposits.close);

router.get('/admin/eod', requirePermission('eod.run'), admin.showEod);
router.post('/admin/eod', requirePermission('eod.run'), admin.runEod);

router.get('/cabinet', requireAuth, cabinet.cabinet);
router.get('/workplace', requireStaff, cabinet.workplace);

export default router;
