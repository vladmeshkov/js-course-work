import { Router } from 'express';
import { requireClient } from '../middleware/auth.js';
import * as accounts from '../controllers/accountsController.js';
import * as cards from '../controllers/cardController.js';
import * as documents from '../controllers/documentController.js';

const router = Router();

// счета, карты и документы доступны только клиенту банка; статичные пути раньше «:id»
router.get('/accounts', requireClient, accounts.list);
router.post('/accounts', requireClient, accounts.create);
router.get('/accounts/:id', requireClient, accounts.show);
router.post('/accounts/:id/close', requireClient, accounts.close);
router.get('/accounts/:id/statement', requireClient, documents.statement);
router.get('/accounts/:id/statement.pdf', requireClient, documents.statementPdf);
router.get('/accounts/:id/certificate.pdf', requireClient, documents.certificatePdf);
router.get('/cards', requireClient, cards.index);
router.get('/cards/new', requireClient, cards.showNew);
router.post('/cards', requireClient, cards.create);
router.get('/cards/:id', requireClient, cards.show);
router.post('/cards/:id/block', requireClient, cards.block);
router.post('/cards/:id/close', requireClient, cards.close);
router.post('/cards/:id/limits', requireClient, cards.limits);
router.post('/cards/:id/purchase', requireClient, cards.purchase);

export default router;
