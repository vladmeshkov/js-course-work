import { Router } from 'express';
import core from './core.js';
import accounts from './accounts.js';
import payments from './payments.js';
import products from './products.js';
import staff from './staff.js';
import admin from './admin.js';

/** Маршруты API (подключаются под /api). По одному файлу на модуль системы. */
const router = Router();
router.use(core, accounts, payments, products, staff, admin);

export default router;
