import { AppError, ValidationError } from '../lib/errors.js';
import * as loanService from '../services/loanService.js';

export async function queue(req, res) {
  res.render('pages/staff/loans', { title: 'Заявки на кредит', applications: await loanService.queue() });
}

export async function review(req, res) {
  const application = await loanService.reviewApplication(Number(req.params.id));
  if (!application) throw new AppError('Заявка не найдена', 404);
  res.render('pages/staff/loan-review', { title: `Заявка № ${application.id}`, application, errors: {} });
}

export async function decide(req, res) {
  const id = Number(req.params.id);
  try {
    await loanService.decide(req.user.id, id, { approve: req.body.decision === 'approve', comment: req.body.comment });
    req.flash('success', req.body.decision === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена');
    res.redirect('/staff/loans');
  } catch (error) {
    if (error instanceof ValidationError) {
      const application = await loanService.reviewApplication(id);
      return res.status(422).render('pages/staff/loan-review', { title: `Заявка № ${id}`, application, errors: error.fields });
    }
    throw error;
  }
}
