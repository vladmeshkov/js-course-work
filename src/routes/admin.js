import { Router } from 'express';
import { requireAuth, requireClient, requireStaff, requirePermission } from '../middleware/auth.js';
import * as admin from '../controllers/adminController.js';

const router = Router();

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
router.get('/admin/clearing', requirePermission('eod.run'), admin.showClearing);
router.get('/admin/eod', requirePermission('eod.run'), admin.showEod);
router.post('/admin/eod', requirePermission('eod.run'), admin.runEod);

export default router;
