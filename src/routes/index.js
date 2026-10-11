import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { requireAuth, requireStaff, requirePermission } from '../middleware/auth.js';
import * as home from '../controllers/homeController.js';
import * as auth from '../controllers/authController.js';
import * as cabinet from '../controllers/cabinetController.js';
import * as accounts from '../controllers/accountsController.js';
import * as transfers from '../controllers/transferController.js';
import * as deposits from '../controllers/depositController.js';
import * as admin from '../controllers/adminController.js';
import * as loans from '../controllers/loanController.js';
import * as staffLoans from '../controllers/staffLoanController.js';
import * as cards from '../controllers/cardController.js';
import * as payments from '../controllers/paymentController.js';
import * as documents from '../controllers/documentController.js';
import * as operator from '../controllers/operatorController.js';
import * as staffFraud from '../controllers/staffFraudController.js';

const router = Router();

// ограничение частоты попыток входа с одного адреса
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false });

router.get('/', home.home);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/login', auth.showLogin);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', auth.logout);
router.get('/register', auth.showRegister);
router.post('/register', auth.register);

// разделы, которые будут реализованы по мере разработки модулей
for (const [path, title] of [['/rates', 'Курсы валют']]) {
  router.get(path, (req, res) => res.render('pages/soon', { title }));
}

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
router.get('/accounts', requireAuth, accounts.list);
router.get('/accounts/:id', requireAuth, accounts.show);
router.get('/accounts/:id/statement', requireAuth, documents.statementPage);
router.get('/accounts/:id/statement.pdf', requireAuth, documents.statementPdf);
router.get('/accounts/:id/certificate.pdf', requireAuth, documents.certificatePdf);

router.get('/transfers/new', requireAuth, transfers.showForm);
router.post('/transfers', requireAuth, transfers.submit);
router.get('/transfers/:id/confirm', requireAuth, transfers.showConfirm);
router.post('/transfers/:id/confirm', requireAuth, transfers.confirm);
router.post('/transfers/:id/cancel', requireAuth, transfers.cancel);

router.get('/deposits', deposits.index);
router.get('/deposits/calc', deposits.calc);
router.get('/deposits/new', requireAuth, deposits.showNew);
router.post('/deposits', requireAuth, deposits.create);
router.get('/deposits/:id', requireAuth, deposits.show);
router.get('/deposits/:id/close', requireAuth, deposits.showClose);
router.post('/deposits/:id/close', requireAuth, deposits.close);

router.get('/admin/rates', requirePermission('rates.manage'), admin.showRates);
router.post('/admin/rates/spreads', requirePermission('rates.manage'), admin.saveSpreads);
router.post('/admin/rates/refresh', requirePermission('rates.manage'), admin.refreshRates);
router.post('/admin/rates/settings', requirePermission('rates.manage'), admin.saveSettings);
router.get('/admin/users', requirePermission('users.manage'), admin.showUsers);
router.post('/admin/users', requirePermission('users.manage'), admin.createUser);
router.post('/admin/users/:id/block', requirePermission('users.manage'), admin.blockUser);
router.post('/admin/users/:id/role', requirePermission('users.manage'), admin.changeRole);
router.get('/admin/audit', requirePermission('audit.view'), admin.showAudit);
router.get('/admin/backups', requirePermission('backup.manage'), admin.showBackups);
router.post('/admin/backups', requirePermission('backup.manage'), admin.createBackup);
router.post('/admin/backups/restore', requirePermission('backup.manage'), admin.restoreBackup);
router.get('/admin/reports', requirePermission('reports.view'), admin.showReports);
router.get('/admin/reports/trial.csv', requirePermission('reports.view'), admin.trialCsv);
router.get('/admin/eod', requirePermission('eod.run'), admin.showEod);
router.post('/admin/eod', requirePermission('eod.run'), admin.runEod);

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

router.get('/cards', requireAuth, cards.index);
router.get('/cards/new', requireAuth, cards.showNew);
router.post('/cards', requireAuth, cards.create);
router.get('/cards/:id', requireAuth, cards.show);
router.post('/cards/:id/block', requireAuth, cards.block);
router.post('/cards/:id/close', requireAuth, cards.close);
router.post('/cards/:id/limits', requireAuth, cards.limits);
router.post('/cards/:id/purchase', requireAuth, cards.purchase);

router.get('/staff/kyc', requirePermission('kyc.review'), operator.kycQueue);
router.get('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycShow);
router.post('/staff/kyc/:id', requirePermission('kyc.review'), operator.kycDecide);
router.get('/staff/cash', requirePermission('cash.operate'), operator.showCash);
router.post('/staff/cash', requirePermission('cash.operate'), operator.cash);
router.get('/staff/accounts', requirePermission('account.freeze'), operator.accounts);
router.post('/staff/accounts/:id/freeze', requirePermission('account.freeze'), operator.freeze);

router.get('/staff/fraud', requirePermission('fraud.review'), staffFraud.queue);
router.get('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.show);
router.post('/staff/fraud/:id', requirePermission('fraud.review'), staffFraud.decide);

router.get('/cabinet', requireAuth, cabinet.cabinet);
router.get('/workplace', requireStaff, cabinet.workplace);

export default router;
