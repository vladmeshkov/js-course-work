import { Router } from 'express';
import accounts from './modules/accounts/routes.js';
import admin from './modules/admin/routes.js';
import auth from './modules/auth/routes.js';
import cards from './modules/cards/routes.js';
import dashboard from './modules/dashboard/routes.js';
import deposits from './modules/deposits/routes.js';
import fraud from './modules/fraud/routes.js';
import loans from './modules/loans/routes.js';
import payments from './modules/payments/routes.js';
import rates from './modules/rates/routes.js';
import staff from './modules/staff/routes.js';
import transfers from './modules/transfers/routes.js';

/** Маршруты API (подключаются под /api): по одному файлу routes.js в каждом модуле. */
const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use(accounts, admin, auth, cards, dashboard, deposits, fraud, loans, payments, rates, staff, transfers);

export default router;
