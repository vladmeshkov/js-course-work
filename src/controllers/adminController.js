import { pool } from '../db/pool.js';
import * as eodService from '../services/eodService.js';
import * as ledgerService from '../services/ledgerService.js';

export async function showEod(req, res) {
  res.render('pages/admin/eod', {
    title: 'Операционный день',
    bankDate: await eodService.currentBankDate(pool),
    balance: await ledgerService.trialBalance(pool),
    result: null
  });
}

export async function runEod(req, res) {
  const days = Math.min(Math.max(Number(req.body.days) || 1, 1), 400);
  const result = await eodService.advanceDays(req.user.id, days);
  req.flash('success', `Операционный день закрыт, новая банковская дата: ${result.date}`);
  res.redirect('/admin/eod');
}
