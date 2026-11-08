import { Router } from 'express';
import { requireClient, requireStaff } from '../../shared/middleware/auth.js';
import * as cabinet from './cabinet.controller.js';
import * as home from './home.controller.js';

/** Главные страницы гостя, клиента и сотрудника, статические страницы и поиск. Подключается под /api. */
const router = Router();

router.get('/home', home.home);
router.get('/info/:slug', home.info);
router.get('/search/index', home.searchIndex);
router.get('/cabinet', requireClient, cabinet.cabinet);
router.get('/workplace', requireStaff, cabinet.workplace);

export default router;
