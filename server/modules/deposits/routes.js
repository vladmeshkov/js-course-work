import { Router } from 'express';
import { requireClient } from '../../shared/middleware/auth.js';
import * as deposits from './deposit.controller.js';
import { idParam } from '../../shared/validate.js';

/** Вклады: каталог и калькулятор открыты гостю, остальное только клиенту. Подключается под /api. */
const router = Router();
router.param('id', idParam);

router.get('/deposits', deposits.index);
router.get('/deposits/calc', deposits.calc);
router.get('/deposits/new', requireClient, deposits.showNew);
router.post('/deposits', requireClient, deposits.create);
router.get('/deposits/:id', requireClient, deposits.show);
router.get('/deposits/:id/close', requireClient, deposits.showClose);
router.post('/deposits/:id/close', requireClient, deposits.close);

export default router;
