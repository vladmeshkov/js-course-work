import { Router } from 'express';
import { requireClient, requirePermission } from '../middleware/auth.js';
import * as deposits from '../controllers/depositController.js';
import * as loans from '../controllers/loanController.js';
import * as staffLoans from '../controllers/staffLoanController.js';

const router = Router();

// Вклады: каталог и калькулятор открыты гостю, остальное только клиенту
router.get('/deposits', deposits.index);
router.get('/deposits/calc', deposits.calc);
router.get('/deposits/new', requireClient, deposits.showNew);
router.post('/deposits', requireClient, deposits.create);
router.get('/deposits/:id', requireClient, deposits.show);
router.get('/deposits/:id/close', requireClient, deposits.showClose);
router.post('/deposits/:id/close', requireClient, deposits.close);

// Кредиты: каталог и калькулятор открыты гостю, остальное только клиенту
router.get('/loans', loans.index);
router.get('/loans/calc', loans.calc);
router.get('/loans/new', requireClient, loans.showNew);
router.post('/loans', requireClient, loans.create);
router.get('/loans/applications/:id', requireClient, loans.showApplication);
router.post('/loans/applications/:id/code', requireClient, loans.sendCode);
router.post('/loans/applications/:id/sign', requireClient, loans.sign);
router.get('/loans/:id', requireClient, loans.show);
router.post('/loans/:id/repay-full', requireClient, loans.repayFull);
router.post('/loans/:id/repay-partial', requireClient, loans.repayPartial);

// Рабочее место кредитного специалиста
router.get('/staff/loans', requirePermission('loan.review'), staffLoans.queue);
router.get('/staff/loans/:id', requirePermission('loan.review'), staffLoans.review);
router.post('/staff/loans/:id', requirePermission('loan.review'), staffLoans.decide);

export default router;
