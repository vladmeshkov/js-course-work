import { Router } from 'express';
import { requireClient, requirePermission } from '../../shared/middleware/auth.js';
import * as loans from './loan.controller.js';
import * as staffLoans from './staff-loan.controller.js';

/** Кредиты клиента (каталог и калькулятор открыты гостю) и рабочее место кредитного специалиста. Подключается под /api. */
const router = Router();

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
router.get('/staff/loans', requirePermission('loan.review'), staffLoans.queue);
router.get('/staff/loans/:id', requirePermission('loan.review'), staffLoans.review);
router.post('/staff/loans/:id', requirePermission('loan.review'), staffLoans.decide);

export default router;
