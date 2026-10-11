import { withTransaction } from '../db/pool.js';
import { BusinessError, ValidationError } from '../lib/errors.js';
import { isValidIban } from '../lib/iban.js';
import * as accountModel from '../models/accountModel.js';
import { ensureInternalAccount } from './accountService.js';
import * as auditService from './auditService.js';
import * as ledgerService from './ledgerService.js';

/**
 * Кассовая операция операциониста: взнос наличных (Дт касса, Кт счёт клиента) или выдача (Дт счёт клиента, Кт касса).
 * @param {number} operatorId
 * @param {{iban:string, amount:number, direction:'in'|'out'}} p
 */
export async function cashOperation(operatorId, { iban, amount, direction }) {
  const clean = String(iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!isValidIban(clean)) throw new ValidationError({ iban: 'Неверный номер счёта: проверьте символы и контрольные цифры' });
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError({ amount: 'Введите сумму больше нуля' });
  if (!['in', 'out'].includes(direction)) throw new ValidationError({ direction: 'Выберите операцию' });
  const account = await accountModel.findByIban(clean);
  if (!account || !['current', 'savings'].includes(account.kind)) throw new ValidationError({ iban: 'Счёт клиента не найден' });
  if (account.status === 'closed') throw new BusinessError('Счёт закрыт');

  return withTransaction(async (db) => {
    const cash = await ensureInternalAccount(db, 'cash', account.currency);
    const entry = direction === 'in'
      ? { debit: cash.id, credit: account.id, amount, currency: account.currency }
      : { debit: account.id, credit: cash.id, amount, currency: account.currency };
    const { documentId } = await ledgerService.post({
      type: direction === 'in' ? 'cash_in' : 'cash_out', description: direction === 'in' ? 'Взнос наличных' : 'Выдача наличных',
      initiatedBy: operatorId, entries: [entry]
    }, db);
    await auditService.log({ userId: operatorId, action: `cash.${direction}`, entity: 'account', entityId: account.id, details: { amount, currency: account.currency } }, db);
    return { documentId, account };
  });
}
