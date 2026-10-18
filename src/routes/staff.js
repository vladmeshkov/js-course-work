import { Router } from 'express';
import { requireAuth, requireClient, requireStaff, requirePermission } from '../middleware/auth.js';
import * as operator from '../controllers/operatorController.js';
import * as staffFraud from '../controllers/staffFraudController.js';

const router = Router();

router.get('/staff/kyc', requirePermission('kyc.review'), operator.kycQueue);
router.get('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycShow);
router.post('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycDecide);
router.get('/staff/cash', requirePermission('cash.operate'), operator.showCash);
router.post('/staff/cash', requirePermission('cash.operate'), operator.cash);
router.get('/staff/incoming', requirePermission('cash.operate'), operator.showIncoming);
router.post('/staff/incoming', requirePermission('cash.operate'), operator.incoming);
router.get('/staff/accounts', requirePermission('account.freeze'), operator.accounts);
router.post('/staff/accounts/:id/freeze', requirePermission('account.freeze'), operator.freeze);
router.get('/staff/fraud', requirePermission('fraud.review'), staffFraud.queue);
router.get('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.show);
router.post('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.decide);

export default router;
