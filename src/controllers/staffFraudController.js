import { AppError, ValidationError } from '../lib/errors.js';
import * as fraudService from '../services/fraudService.js';
import * as transferService from '../services/transferService.js';

export async function queue(req, res) {
  res.render('pages/staff/fraud', { title: 'Антифрод', cases: await fraudService.queue(), special: await fraudService.specialControlReport(30) });
}

export async function show(req, res) {
  const fraudCase = await fraudService.findCase(Number(req.params.id));
  if (!fraudCase) throw new AppError('Случай не найден', 404);
  res.render('pages/staff/fraud-case', { title: `Случай № ${fraudCase.id}`, fraudCase, errors: {} });
}

export async function decide(req, res) {
  const id = Number(req.params.id);
  try {
    await transferService.reviewHeldTransfer(req.user.id, id, { approve: req.body.decision === 'approve', comment: req.body.comment });
    req.flash('success', req.body.decision === 'approve' ? 'Перевод проведён' : 'Перевод отклонён, деньги разблокированы');
    res.redirect('/staff/fraud');
  } catch (error) {
    if (error instanceof ValidationError) {
      const fraudCase = await fraudService.findCase(id);
      return res.status(422).render('pages/staff/fraud-case', { title: `Случай № ${id}`, fraudCase, errors: error.fields });
    }
    throw error;
  }
}
