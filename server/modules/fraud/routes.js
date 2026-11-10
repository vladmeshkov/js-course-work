import { Router } from 'express';
import { requirePermission } from '../../shared/middleware/auth.js';
import * as staffFraud from './fraud.controller.js';
import { idParam } from '../../shared/validate.js';

/** Антифрод: очередь задержанных переводов и решение специалиста по мониторингу. Подключается под /api. */
const router = Router();
router.param('id', idParam);

router.get('/staff/fraud', requirePermission('fraud.review'), staffFraud.queue);
router.get('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.show);
router.post('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.decide);

export default router;
