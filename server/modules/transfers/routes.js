import { Router } from 'express';
import { requireClient } from '../../shared/middleware/auth.js';
import * as interbank from './interbank.controller.js';
import * as transfers from './transfer.controller.js';

/** Переводы: клиентам банка, между своими счетами, в другие банки. Статичные пути раньше «:id». Подключается под /api. */
const router = Router();

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
