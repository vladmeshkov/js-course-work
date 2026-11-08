import { Router } from 'express';
import * as rates from './rates.controller.js';

/** Курсы валют и конвертер, открыты всем. Подключается под /api. */
const router = Router();

router.get('/rates', rates.index);
router.get('/rates/convert', rates.convert);

export default router;
