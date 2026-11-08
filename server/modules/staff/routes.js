import { Router } from 'express';
import { requirePermission } from '../../shared/middleware/auth.js';
import * as operator from './operator.controller.js';

/** Рабочее место операциониста: анкеты, касса, входящие платежи, блокировка счетов. Подключается под /api. */
const router = Router();

router.get('/staff/kyc', requirePermission('kyc.review'), operator.kycQueue);
router.get('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycShow);
router.post('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycDecide);
router.post('/staff/cash', requirePermission('cash.operate'), operator.cash);
router.get('/staff/incoming', requirePermission('cash.operate'), operator.incomingForm);
router.post('/staff/incoming', requirePermission('cash.operate'), operator.incoming);
router.get('/staff/accounts', requirePermission('account.freeze'), operator.accounts);
router.post('/staff/accounts/:id/freeze', requirePermission('account.freeze'), operator.freeze);

export default router;
