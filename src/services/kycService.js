import { withTransaction } from '../db/pool.js';
import { AppError, BusinessError } from '../lib/errors.js';
import { decrypt } from '../lib/crypto.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from './accountService.js';
import * as auditService from './auditService.js';
import { notify } from './notificationService.js';

/**
 * Операционист подтверждает анкету. Клиент становится верифицированным,
 * и ему автоматически открывается первый текущий счёт в BYN.
 */
export function verifyClient(clientId, operatorId) {
  return withTransaction(async (db) => {
    const { rows: [client] } = await db.query('SELECT id, kyc_status FROM clients WHERE id = ? FOR UPDATE', [clientId]);
    if (!client) throw new BusinessError('Анкета не найдена');
    if (client.kyc_status === 'verified') throw new BusinessError('Клиент уже верифицирован');
    await clientModel.setKycStatus(db, clientId, 'verified');
    const account = await accountService.openClientAccount(db, { clientId, kind: 'current', currency: 'BYN', userId: operatorId });
    await auditService.log({ userId: operatorId, action: 'kyc.verify', entity: 'client', entityId: clientId }, db);
    await notify((await db.query('SELECT user_id FROM clients WHERE id = ?', [clientId])).rows[0].user_id, { type: 'account', title: 'Анкета подтверждена', body: 'Вам открыт текущий счёт в BYN. Можно пользоваться всеми услугами банка.', link: '/accounts' }, db);
    return account;
  });
}

export function rejectClient(clientId, operatorId, comment) {
  return withTransaction(async (db) => {
    await clientModel.setKycStatus(db, clientId, 'rejected', comment);
    await auditService.log({ userId: operatorId, action: 'kyc.reject', entity: 'client', entityId: clientId, details: { comment } }, db);
    await notify((await db.query('SELECT user_id FROM clients WHERE id = ?', [clientId])).rows[0].user_id, { type: 'account', title: 'Заявка отклонена', body: `Причина: ${comment}`, link: '/cabinet' }, db);
  });
}

export const queue = () => clientModel.listByKycStatus('submitted');

/** Анкета для проверки: паспорт и идентификационный номер расшифровываются, факт просмотра пишется в журнал. */
export async function getForReview(clientId, operatorId) {
  const client = await clientModel.findFull(clientId);
  if (!client) throw new AppError('Анкета не найдена', 404);
  await auditService.log({ userId: operatorId, action: 'kyc.view', entity: 'client', entityId: clientId });
  return { ...client, idNumber: decrypt(client.id_number_enc), passport: decrypt(client.passport_enc) };
}
