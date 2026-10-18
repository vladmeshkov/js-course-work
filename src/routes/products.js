import { Router } from 'express';
import { requireAuth, requireClient, requireStaff, requirePermission } from '../middleware/auth.js';
import * as deposits from '../controllers/depositController.js';
import * as loans from '../controllers/loanController.js';
import * as staffLoans from '../controllers/staffLoanController.js';

const router = Router();

router.get('/deposits', deposits.index);
router.get('/deposits/calc', deposits.calc);
router.get('/deposits/new', requireAuth, deposits.showNew);
router.post('/deposits', requireAuth, deposits.create);
router.get('/deposits/:id', requireAuth, deposits.show);
router.get('/deposits/:id/close', requireAuth, deposits.showClose);
router.post('/deposits/:id/close', requireAuth, deposits.close);
router.get('/loans', loans.index);
router.get('/loans/calc', loans.calc);
router.get('/loans/new', requireAuth, loans.showNew);
router.post('/loans', requireAuth, loans.create);
router.get('/loans/applications/:id', requireAuth, loans.showApplication);
router.post('/loans/applications/:id/code', requireAuth, loans.sendCode);
router.post('/loans/applications/:id/sign', requireAuth, loans.sign);
router.get('/loans/:id', requireAuth, loans.show);
router.post('/loans/:id/repay-full', requireAuth, loans.repayFull);
router.post('/loans/:id/repay-partial', requireAuth, loans.repayPartial);
router.get('/staff/loans', requirePermission('loan.review'), staffLoans.queue);
router.get('/staff/loans/:id', requirePermission('loan.review'), staffLoans.review);
router.post('/staff/loans/:id', requirePermission('loan.review'), staffLoans.decide);

export default router;
