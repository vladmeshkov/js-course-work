import { BusinessError } from '../../shared/errors.js';
import * as clientModel from './client.model.js';

/**
 * Клиент пользователя, анкету которого подтвердил сотрудник банка. Банковские продукты доступны только ему.
 * @param {number} userId
 * @param {string} message текст отказа для конкретного продукта («Вклады доступны после проверки анкеты…»)
 */
export async function requireVerified(userId, message) {
  const client = await clientModel.findByUserId(userId);
  if (!client || client.kyc_status !== 'verified') throw new BusinessError(message);
  return client;
}
