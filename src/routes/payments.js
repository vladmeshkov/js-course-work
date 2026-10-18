import { Router } from 'express';
import { requireAuth, requireClient, requireStaff, requirePermission } from '../middleware/auth.js';
import * as documents from '../controllers/documentController.js';
import * as interbank from '../controllers/interbankController.js';
import * as payments from '../controllers/paymentController.js';
import * as transfers from '../controllers/transferController.js';

const router = Router();

router.get('/payments', requireAuth, payments.hub);
router.get('/payments/catalog', requireAuth, payments.catalog);
router.get('/payments/catalog/:id', requireAuth, payments.category);
router.get('/payments/pay/:providerId', requireAuth, payments.showPay);
router.post('/payments/pay', requireAuth, payments.pay);
router.get('/payments/:id/receipt', requireAuth, payments.receipt);
router.get('/payments/:id/receipt.pdf', requireAuth, documents.receiptPdf);
router.post('/payments/templates/:id/delete', requireAuth, payments.deleteTemplate);
router.post('/payments/templates/:id/autopay', requireAuth, payments.createAutopay);
router.post('/payments/autopay/:id/cancel', requireAuth, payments.cancelAutopay);
router.get('/transfers/interbank', requireAuth, interbank.showForm);
router.post('/transfers/interbank', requireAuth, interbank.create);
router.get('/transfers/interbank/:id/confirm', requireAuth, interbank.showConfirm);
router.post('/transfers/interbank/:id/confirm', requireAuth, interbank.confirm);
router.post('/transfers/interbank/:id/cancel', requireAuth, interbank.cancel);
router.get('/transfers/new', requireAuth, transfers.showForm);
router.post('/transfers', requireAuth, transfers.submit);
router.get('/transfers/:id/confirm', requireAuth, transfers.showConfirm);
router.post('/transfers/:id/confirm', requireAuth, transfers.confirm);
router.post('/transfers/:id/cancel', requireAuth, transfers.cancel);

export default router;
