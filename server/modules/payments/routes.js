import { Router } from 'express';
import { requireClient } from '../../shared/middleware/auth.js';
import * as documents from '../accounts/document.controller.js';
import * as payments from './payment.controller.js';
import { idParam } from '../../shared/validate.js';

/** Платежи по каталогу, шаблоны, автоплатежи, квитанции. Статичные пути раньше «:id». Подключается под /api. */
const router = Router();
router.param('id', idParam);
router.param('providerId', idParam);

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

export default router;
