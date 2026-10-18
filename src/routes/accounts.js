import { Router } from 'express';
import { requireAuth, requireClient, requireStaff, requirePermission } from '../middleware/auth.js';
import * as accounts from '../controllers/accountsController.js';
import * as cards from '../controllers/cardController.js';
import * as documents from '../controllers/documentController.js';

const router = Router();

router.get('/accounts', requireAuth, accounts.list);
router.get('/accounts/new', requireAuth, accounts.showNew);
router.post('/accounts', requireAuth, accounts.create);
router.get('/accounts/:id', requireAuth, accounts.show);
router.post('/accounts/:id/close', requireAuth, accounts.close);
router.get('/accounts/:id/statement', requireAuth, documents.statementPage);
router.get('/accounts/:id/statement.pdf', requireAuth, documents.statementPdf);
router.get('/accounts/:id/certificate.pdf', requireAuth, documents.certificatePdf);
router.get('/cards', requireAuth, cards.index);
router.get('/cards/new', requireAuth, cards.showNew);
router.post('/cards', requireAuth, cards.create);
router.get('/cards/:id', requireAuth, cards.show);
router.post('/cards/:id/block', requireAuth, cards.block);
router.post('/cards/:id/close', requireAuth, cards.close);
router.post('/cards/:id/limits', requireAuth, cards.limits);
router.post('/cards/:id/purchase', requireAuth, cards.purchase);

export default router;
