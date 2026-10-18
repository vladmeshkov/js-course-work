import { Router } from 'express';
import { requireClient } from '../middleware/auth.js';
import * as documents from '../controllers/documentController.js';
import * as interbank from '../controllers/interbankController.js';
import * as payments from '../controllers/paymentController.js';
import * as transfers from '../controllers/transferController.js';

/** Платежи и переводы (подключается под /api). Всё только для клиента банка. Статичные пути раньше «:id». */
const router = Router();

router.get('/payments', requireClient, payments.hub);
router.get('/payments/catalog', requireClient, payments.catalog);
router.get('/payments/catalog/:id', requireClient, payments.category);
router.get('/payments/pay/:providerId', requireClient, payments.showPay);
router.post('/payments/pay', requireClient, payments.pay);
router.post('/payments/templates/:id/delete', requireClient, payments.deleteTemplate);
router.post('/payments/templates/:id/autopay', requireClient, payments.createAutopay);
router.post('/payments/autopay/:id/cancel', requireClient, payments.cancelAutopay);
router.get('/payments/:id/receipt', requireClient, payments.receipt);
router.get('/payments/:id/receipt.pdf', requireClient, documents.receiptPdf);

router.get('/transfers/interbank', requireClient, interbank.showForm);
router.post('/transfers/interbank', requireClient, interbank.create);
router.get('/transfers/interbank/:id/confirm', requireClient, interbank.showConfirm);
router.post('/transfers/interbank/:id/confirm', requireClient, interbank.confirm);
router.post('/transfers/interbank/:id/cancel', requireClient, interbank.cancel);
router.get('/transfers/new', requireClient, transfers.showForm);
router.post('/transfers', requireClient, transfers.submit);
router.get('/transfers/:id/confirm', requireClient, transfers.showConfirm);
router.post('/transfers/:id/confirm', requireClient, transfers.confirm);
router.post('/transfers/:id/cancel', requireClient, transfers.cancel);

export default router;
