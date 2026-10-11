import { query, withTransaction } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import * as settingsModel from '../models/settingsModel.js';
import * as auditService from './auditService.js';

/*
 * Антифрод. Набор правил даёт баллы риска, сумма баллов определяет решение:
 *   ниже порога подтверждения: пропустить; от порога подтверждения: потребовать код;
 *   от порога проверки: задержать перевод и отправить специалисту по финансовому мониторингу.
 * Пороги и суммы задаются в таблице settings (ключи fraud.*), их меняет администратор.
 * Отдельно отмечаются операции особого контроля: сумма не ниже порога по Закону № 165-З.
 */

/**
 * Рассчитывает риск перевода другому клиенту.
 * @param {{userId:number, clientId:number, toAccountId:number, amountByn:number}} ctx
 * @returns {Promise<{score:number, reasons:Array<{rule:string, points:number, text:string}>, decision:'allow'|'confirm'|'review', special:boolean}>}
 */
export async function evaluate(ctx, db = { query }) {
  const s = (key) => settingsModel.getNumber(key, db);
  const reasons = [];
  const add = (rule, points, text) => reasons.push({ rule, points, text });

  if (ctx.amountByn >= (await s('fraud.large_amount'))) add('large_amount', 40, 'Крупная сумма перевода');

  if (ctx.amountByn >= (await s('fraud.new_recipient_amount'))) {
    const { rowCount } = await db.query(
      "SELECT 1 FROM transfer_intents WHERE user_id = $1 AND to_account_id = $2 AND status = 'confirmed' LIMIT 1", [ctx.userId, ctx.toAccountId]);
    if (!rowCount) add('new_recipient', 30, 'Первый перевод этому получателю на значительную сумму');
  }

  const minutes = await s('fraud.velocity_minutes');
  const { rows: [recent] } = await db.query(
    `SELECT count(*)::int AS n FROM transfer_intents
     WHERE user_id = $1 AND kind = 'client' AND status <> 'cancelled' AND created_at > now() - make_interval(mins => $2::int)`,
    [ctx.userId, minutes]);
  // текущая заявка в базе ещё не создана, поэтому учитываем её отдельно
  if (recent.n + 1 >= (await s('fraud.velocity_count'))) add('velocity', 30, `Много переводов за ${minutes} минут`);

  if (ctx.amountByn >= (await s('fraud.new_client_amount'))) {
    const { rowCount } = await db.query("SELECT 1 FROM clients WHERE id = $1 AND created_at > now() - interval '3 days'", [ctx.clientId]);
    if (rowCount) add('new_client', 20, 'Крупный перевод в первые дни после регистрации');
  }

  const score = reasons.reduce((t, r) => t + r.points, 0);
  const decision = score >= (await s('fraud.score_review')) ? 'review' : score >= (await s('fraud.score_confirm')) ? 'confirm' : 'allow';
  return { score, reasons, decision, special: ctx.amountByn >= (await s('fraud.special_control')) };
}

/** Записывает случай. Для задержанных переводов статус «open» (в очереди), для остальных «auto». */
export async function recordCase(db, intent, risk) {
  const decision = risk.decision === 'allow' ? 'special' : risk.decision;
  const { rows } = await db.query(
    `INSERT INTO fraud_cases (intent_id, user_id, score, reasons, decision, status, special_control, amount_byn)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [intent.id, intent.user_id, risk.score, JSON.stringify(risk.reasons), decision, risk.decision === 'review' ? 'open' : 'auto', risk.special, intent.amount_byn]);
  return rows[0];
}

export async function queue(db = { query }) {
  const { rows } = await db.query(
    `SELECT f.*, u.login, t.amount, t.comment, fa.iban AS from_iban, ta.iban AS to_iban, fa.currency
     FROM fraud_cases f JOIN users u ON u.id = f.user_id JOIN transfer_intents t ON t.id = f.intent_id
     JOIN accounts fa ON fa.id = t.from_account_id JOIN accounts ta ON ta.id = t.to_account_id
     WHERE f.status = 'open' ORDER BY f.id`);
  return rows;
}

export async function findCase(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT f.*, u.login, t.amount, t.fee, t.comment, t.kind, fa.iban AS from_iban, ta.iban AS to_iban, fa.currency
     FROM fraud_cases f JOIN users u ON u.id = f.user_id JOIN transfer_intents t ON t.id = f.intent_id
     JOIN accounts fa ON fa.id = t.from_account_id JOIN accounts ta ON ta.id = t.to_account_id WHERE f.id = $1`, [id]);
  return rows[0];
}

/** Отчёт по операциям особого контроля за период. */
export async function specialControlReport(limit = 200) {
  const { rows } = await query(
    `SELECT f.id, f.created_at, f.amount_byn, f.score, f.status, u.login
     FROM fraud_cases f JOIN users u ON u.id = f.user_id WHERE f.special_control ORDER BY f.id DESC LIMIT $1`, [limit]);
  return rows;
}

/**
 * Решение специалиста по задержанному переводу.
 * Одобрение проводит перевод, отказ снимает холд и отменяет заявку.
 * @param {(userId:number, intentId:string) => Promise<any>} executeIntent функция проведения перевода
 */
export async function review(officerId, caseId, { approve, comment }, executeIntent) {
  const fraudCase = await findCase(caseId);
  if (!fraudCase) throw new AppError('Случай не найден', 404);
  if (fraudCase.status !== 'open') throw new BusinessError('Случай уже рассмотрен');
  if (!approve && !String(comment ?? '').trim()) throw new ValidationError({ comment: 'Укажите причину отказа' });

  if (approve) {
    // холд снимается до проведения, иначе он заблокирует собственный перевод
    await withTransaction(async (db) => {
      await db.query("UPDATE holds SET status = 'released', closed_at = now() WHERE intent_id = $1 AND status = 'active'", [fraudCase.intent_id]);
      await db.query("UPDATE transfer_intents SET status = 'new' WHERE id = $1 AND status = 'review'", [fraudCase.intent_id]);
    });
    await executeIntent(fraudCase.user_id, fraudCase.intent_id);
  } else {
    await withTransaction(async (db) => {
      await db.query("UPDATE holds SET status = 'released', closed_at = now() WHERE intent_id = $1 AND status = 'active'", [fraudCase.intent_id]);
      await db.query("UPDATE transfer_intents SET status = 'rejected' WHERE id = $1", [fraudCase.intent_id]);
    });
  }
  await query(
    "UPDATE fraud_cases SET status = $2, reviewed_by = $3, reviewed_at = now(), comment = $4 WHERE id = $1",
    [caseId, approve ? 'approved' : 'rejected', officerId, String(comment ?? '').trim() || null]);
  await auditService.log({ userId: officerId, action: approve ? 'fraud.approve' : 'fraud.reject', entity: 'fraud_case', entityId: caseId });
}
