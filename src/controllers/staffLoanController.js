import { AppError, ValidationError } from '../lib/errors.js';
import * as loanService from '../services/loanService.js';

/** Очередь заявок на ручном рассмотрении. */
export async function queue(req, res) {
  res.json({ applications: await loanService.queue() });
}

/** Анкета заёмщика и результаты проверок по заявке. */
export async function review(req, res) {
  const application = await loanService.reviewApplication(Number(req.params.id));
  if (!application) throw new AppError('Заявка не найдена', 404);
  res.json({ application });
}

/** Решение по заявке: decision «approve» или «reject» (при отказе нужен комментарий). */
export async function decide(req, res) {
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) throw new ValidationError({ decision: 'Выберите решение: одобрить или отказать' });
  await loanService.decide(req.user.id, Number(req.params.id), { approve: decision === 'approve', comment: req.body.comment });
  res.json({ status: decision === 'approve' ? 'approved' : 'rejected' });
}
