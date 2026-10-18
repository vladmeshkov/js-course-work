import { NotFoundError } from '../lib/errors.js';
import * as fraudService from '../services/fraudService.js';
import * as transferService from '../services/transferService.js';

/** Очередь задержанных переводов и операции особого контроля. */
export async function queue(req, res) {
  res.json({ cases: await fraudService.queue(), special: await fraudService.specialControlReport(30) });
}

export async function show(req, res) {
  const fraudCase = await fraudService.findCase(Number(req.params.id));
  if (!fraudCase) throw new NotFoundError('Случай не найден');
  res.json({ fraudCase });
}

/** Решение по случаю: decision = approve (перевод проводится) или reject (нужен комментарий, деньги разблокируются). */
export async function decide(req, res) {
  const approve = req.body.decision === 'approve';
  await transferService.reviewHeldTransfer(req.user.id, Number(req.params.id), { approve, comment: req.body.comment });
  res.json({ status: 'ok', decision: approve ? 'approve' : 'reject', message: approve ? 'Перевод одобрен' : 'Перевод отклонён, деньги разблокированы' });
}
