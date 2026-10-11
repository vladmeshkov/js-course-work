import { withTransaction } from '../db/pool.js';
import { BusinessError } from '../lib/errors.js';
import * as accountModel from '../models/accountModel.js';

/*
 * Двойная запись. Каждая проводка: Дт счёт, Кт счёт, сумма.
 * Остаток счёта (balance) = обороты по Кт минус обороты по Дт, в копейках.
 * У счёта клиента Кт увеличивает остаток. У внутренних счетов банка (касса, ссуды)
 * остаток может быть отрицательным: так показывается их дебетовое сальдо.
 */

/**
 * @typedef {{debit:number, credit:number, amount:number, currency:string}} Entry
 * @typedef {{type:string, description?:string, initiatedBy?:number, idempotencyKey?:string, entries:Entry[], reversesId?:number, skipFundsCheck?:boolean}} PostRequest
 */

/**
 * Проводит документ с набором проводок в одной транзакции.
 * Если передан db, проводка выполняется в транзакции вызывающего кода.
 * @param {PostRequest} request
 * @param {import('pg').PoolClient} [db]
 * @returns {Promise<{documentId:number, duplicate:boolean}>}
 */
export function post(request, db) {
  if (db) return postInTransaction(db, request);
  return withTransaction((client) => postInTransaction(client, request));
}

async function postInTransaction(db, request) {
  const { type, description = '', initiatedBy = null, idempotencyKey = null, entries, reversesId = null } = request;
  if (!entries?.length) throw new Error('Документ без проводок');
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount) || e.amount <= 0) throw new BusinessError('Сумма должна быть положительной');
    if (e.debit === e.credit) throw new Error('Дебет и кредит совпадают');
  }

  if (idempotencyKey) {
    const { rows } = await db.query('SELECT id FROM documents WHERE idempotency_key = $1', [idempotencyKey]);
    if (rows[0]) return { documentId: rows[0].id, duplicate: true };
  }

  const accounts = await accountModel.lockAll(db, entries.flatMap((e) => [e.debit, e.credit]));

  // изменение остатка по каждому счёту: Кт увеличивает, Дт уменьшает
  const delta = new Map();
  for (const e of entries) {
    const debit = accounts.get(e.debit);
    const credit = accounts.get(e.credit);
    if (!debit || !credit) throw new BusinessError('Счёт не найден');
    if (debit.status === 'closed' || credit.status === 'closed') throw new BusinessError('Счёт закрыт');
    if (debit.status === 'frozen') throw new BusinessError('Счёт заблокирован: списание запрещено');
    delta.set(e.debit, (delta.get(e.debit) ?? 0) - e.amount);
    delta.set(e.credit, (delta.get(e.credit) ?? 0) + e.amount);
  }

  if (!request.skipFundsCheck) {
    for (const [id, change] of delta) {
      const account = accounts.get(id);
      if (account.kind === 'internal' || account.kind === 'loan' || change >= 0) continue;
      const held = await accountModel.heldAmount(db, id);
      if (account.balance + change - held < account.min_balance) {
        throw new BusinessError('Недостаточно средств на счёте', 'insufficient_funds');
      }
    }
  }

  const { rows: [state] } = await db.query('SELECT bank_date FROM bank_state');
  let documentId;
  try {
    const { rows } = await db.query(
      `INSERT INTO documents (type, idempotency_key, initiated_by, bank_date, description, reverses_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [type, idempotencyKey, initiatedBy, state.bank_date, description, reversesId]
    );
    documentId = rows[0].id;
  } catch (error) {
    // параллельный повторный запрос с тем же ключом: возвращаем уже созданный документ
    if (error.code === '23505' && idempotencyKey) {
      const { rows } = await db.query('SELECT id FROM documents WHERE idempotency_key = $1', [idempotencyKey]);
      return { documentId: rows[0].id, duplicate: true };
    }
    throw error;
  }

  for (const e of entries) {
    await db.query(
      `INSERT INTO postings (document_id, debit_account_id, credit_account_id, amount, currency, bank_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [documentId, e.debit, e.credit, e.amount, e.currency, state.bank_date]
    );
  }
  for (const [id, change] of delta) await accountModel.addToBalance(db, id, change);
  return { documentId, duplicate: false };
}

/**
 * Сторно: проводки исправляемого документа повторяются с обратным знаком (Дт и Кт меняются местами).
 * @param {number} documentId
 * @param {{userId?:number, reason?:string}} [options]
 */
export function reverse(documentId, options = {}) {
  return withTransaction(async (db) => {
    const { rows: [doc] } = await db.query('SELECT id, status FROM documents WHERE id = $1 FOR UPDATE', [documentId]);
    if (!doc) throw new BusinessError('Документ не найден');
    if (doc.status === 'reversed') throw new BusinessError('Документ уже сторнирован');
    const { rows: postings } = await db.query(
      'SELECT debit_account_id, credit_account_id, amount, currency FROM postings WHERE document_id = $1', [documentId]);
    const result = await postInTransaction(db, {
      type: 'storno',
      description: options.reason ?? `Сторно документа ${documentId}`,
      initiatedBy: options.userId,
      reversesId: documentId,
      skipFundsCheck: true,
      entries: postings.map((p) => ({ debit: p.credit_account_id, credit: p.debit_account_id, amount: p.amount, currency: p.currency }))
    });
    await db.query("UPDATE documents SET status = 'reversed' WHERE id = $1", [documentId]);
    return result;
  });
}

/**
 * Остаток по проводкам. Нужен для сверки с кэшем accounts.balance.
 * @param {import('pg').PoolClient | {query: Function}} db
 */
export async function balanceFromPostings(db, accountId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN credit_account_id = $1 THEN amount ELSE -amount END), 0) AS balance
     FROM postings WHERE credit_account_id = $1 OR debit_account_id = $1`,
    [accountId]
  );
  return Number(rows[0].balance);
}

/**
 * Контроль двойной записи: в каждой валюте сумма остатков всех счетов равна нулю
 * (каждая проводка уменьшает один счёт и ровно настолько увеличивает другой).
 * @returns {Promise<Array<{currency:string, net:number, ok:boolean}>>}
 */
export async function trialBalance(db) {
  const { rows } = await db.query('SELECT currency, SUM(balance) AS net FROM accounts GROUP BY currency ORDER BY currency');
  return rows.map((r) => ({ currency: r.currency, net: Number(r.net), ok: Number(r.net) === 0 }));
}
