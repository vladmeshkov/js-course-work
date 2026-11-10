import { withTransaction } from '../../db/pool.js';
import { BusinessError, NotFoundError } from '../../shared/errors.js';
import { decrypt } from '../../shared/crypto.js';
import * as clientModel from './client.model.js';
import * as accountService from '../accounts/account.service.js';
import * as auditService from '../audit/audit.service.js';
import { notify } from '../notifications/notification.service.js';

/** Анкета ждёт решения: только такие анкеты можно смотреть с паспортными данными, подтверждать и отклонять. */
const PENDING = ['submitted', 'in_review'];

/** Блокирует анкету до конца транзакции и проверяет, что решение по ней ещё не принято. */
async function lockPending(db, clientId) {
  const { rows: [client] } = await db.query('SELECT id, user_id, kyc_status FROM clients WHERE id = ? FOR UPDATE', [clientId]);
  if (!client) throw new NotFoundError('Анкета не найдена');
  if (!PENDING.includes(client.kyc_status)) throw new BusinessError('Решение по анкете уже принято');
  return client;
}

/**
 * Операционист подтверждает анкету. Клиент становится верифицированным,
 * и ему автоматически открывается первый текущий счёт в BYN.
 */
export function verifyClient(clientId, operatorId) {
  return withTransaction(async (db) => {
    const client = await lockPending(db, clientId);
    await clientModel.setKycStatus(db, clientId, 'verified');
    const account = await accountService.openClientAccount(db, { clientId, kind: 'current', currency: 'BYN', userId: operatorId });
    await auditService.log({ userId: operatorId, action: 'kyc.verify', entity: 'client', entityId: clientId }, db);
    await notify(client.user_id, { type: 'account', title: 'Анкета подтверждена', body: 'Вам открыт текущий счёт в BYN. Можно пользоваться всеми услугами банка.', link: '/accounts' }, db);
    return account;
  });
}

/** Отказ по анкете. Отклонить можно только анкету, которая ждёт решения, а не действующего клиента. */
export function rejectClient(clientId, operatorId, comment) {
  const reason = String(comment).trim().slice(0, 500);
  return withTransaction(async (db) => {
    const client = await lockPending(db, clientId);
    await clientModel.setKycStatus(db, clientId, 'rejected', reason);
    await auditService.log({ userId: operatorId, action: 'kyc.reject', entity: 'client', entityId: clientId, details: { comment: reason } }, db);
    await notify(client.user_id, { type: 'account', title: 'Заявка отклонена', body: `Причина: ${reason}`, link: '/cabinet' }, db);
  });
}

export const queue = () => clientModel.listByKycStatus('submitted');

/** Анкета для проверки (только ожидающая решения): паспорт и идентификационный номер расшифровываются, факт просмотра пишется в журнал. */
export async function getForReview(clientId, operatorId) {
  const client = await clientModel.findFull(clientId);
  if (!client) throw new NotFoundError('Анкета не найдена');
  // паспортные данные открываются только по анкетам в очереди, а не по любому клиенту банка
  if (!PENDING.includes(client.kyc_status)) throw new BusinessError('Решение по анкете уже принято');
  await auditService.log({ userId: operatorId, action: 'kyc.view', entity: 'client', entityId: clientId });
  return { ...client, idNumber: decrypt(client.id_number_enc), passport: decrypt(client.passport_enc) };
}
