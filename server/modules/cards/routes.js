import { Router } from 'express';
import { requireClient } from '../../shared/middleware/auth.js';
import * as cards from './card.controller.js';

/** Карты клиента: выпуск, лимиты, блокировка, покупки. Подключается под /api. */
const router = Router();

router.get('/cards', requireClient, cards.index);
router.get('/cards/new', requireClient, cards.showNew);
router.post('/cards', requireClient, cards.create);
router.get('/cards/:id', requireClient, cards.show);
router.post('/cards/:id/block', requireClient, cards.block);
router.post('/cards/:id/close', requireClient, cards.close);
router.post('/cards/:id/limits', requireClient, cards.limits);
router.post('/cards/:id/purchase', requireClient, cards.purchase);

export default router;
