import { Router } from 'express';
import { requireClient } from '../../shared/middleware/auth.js';
import * as accounts from './accounts.controller.js';
import * as documents from './document.controller.js';
import { idParam } from '../../shared/validate.js';

/** Счета и документы (выписки, справки, PDF). Только для клиента банка. Подключается под /api. */
const router = Router();
router.param('id', idParam);

router.get('/accounts', requireClient, accounts.list);
router.post('/accounts', requireClient, accounts.create);
router.get('/accounts/:id', requireClient, accounts.show);
router.post('/accounts/:id/close', requireClient, accounts.close);
router.get('/accounts/:id/statement', requireClient, documents.statement);
router.get('/accounts/:id/statement.pdf', requireClient, documents.statementPdf);
router.get('/accounts/:id/certificate.pdf', requireClient, documents.certificatePdf);

export default router;
