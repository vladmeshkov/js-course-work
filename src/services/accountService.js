import { config } from '../config/index.js';
import { buildIban } from '../lib/iban.js';
import { BusinessError } from '../lib/errors.js';
import * as accountModel from '../models/accountModel.js';
import * as auditService from './auditService.js';

/** Коды балансовых счетов (первые 4 символа номера счёта в IBAN). */
export const BALANCE_CODES = {
  current: '2400',
  savings: '2420',
  deposit: '2600',
  loan: '2200',
  cash: '1010',
  income: '6000',
  expense: '7000',
  correspondent: '1100',
  conversion: '1210'
};

const CLIENT_KINDS = {
  current: 'Текущий счёт',
  savings: 'Накопительный счёт'
};

/**
 * Открывает счёт клиента.
 * @param {import('pg').PoolClient} db клиент транзакции
 * @param {{clientId:number, kind:'current'|'savings', currency:string, userId?:number}} p
 */
export async function openClientAccount(db, { clientId, kind, currency, userId }) {
  if (!CLIENT_KINDS[kind]) throw new BusinessError('Неизвестный вид счёта');
  const number = await accountModel.nextNumber(db);
  const account = await accountModel.insert(db, {
    iban: buildIban(config.bankCode, BALANCE_CODES[kind], number),
    ownerClientId: clientId,
    balanceCode: BALANCE_CODES[kind],
    kind,
    title: `${CLIENT_KINDS[kind]}, ${currency}`,
    currency
  });
  await auditService.log({ userId, action: 'account.open', entity: 'account', entityId: account.id, details: { currency, kind } }, db);
  return account;
}

/**
 * Открывает внутренний счёт банка (касса, доходы, расходы) для валюты.
 * Если такой счёт уже есть, возвращает его.
 */
export async function ensureInternalAccount(db, purpose, currency) {
  const existing = await accountModel.findByPurpose(db, purpose, currency);
  if (existing) return existing;
  const code = BALANCE_CODES[purpose];
  const number = await accountModel.nextNumber(db);
  return accountModel.insert(db, {
    iban: buildIban(config.bankCode, code, number),
    balanceCode: code,
    kind: 'internal',
    title: `Внутренний счёт: ${purpose}, ${currency}`,
    purpose,
    currency
  });
}

export function listForClient(clientId) {
  return accountModel.listByClient(clientId);
}
