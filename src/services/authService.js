import bcrypt from 'bcrypt';
import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
import { encrypt, lookupHash } from '../lib/crypto.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { check, rules } from '../lib/validate.js';
import * as userModel from '../models/userModel.js';
import * as clientModel from '../models/clientModel.js';
import * as auditService from './auditService.js';

const BCRYPT_ROUNDS = 12;
// хэш для выравнивания времени ответа, когда логин не найден
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

/**
 * Заявка гостя на подключение: создаёт пользователя-клиента и анкету со статусом «подана».
 * Счёт откроется после проверки анкеты операционистом.
 * @param {Record<string, string>} form
 * @param {string} [ip]
 */
export async function register(form, ip) {
  const values = {
    ...form,
    login: String(form.login ?? '').trim().toLowerCase(),
    idNumber: String(form.idNumber ?? '').trim().toUpperCase(),
    passport: String(form.passport ?? '').trim().toUpperCase(),
    phone: String(form.phone ?? '').replace(/[\s()-]/g, '')
  };
  const errors = check(values, {
    lastName: [rules.required], firstName: [rules.required],
    birthDate: [rules.adult], phone: [rules.phone], email: [rules.email],
    idNumber: [rules.idNumber], passport: [rules.passport],
    login: [rules.login], password: [rules.password]
  });
  if (values.password !== values.passwordRepeat) errors.passwordRepeat = 'Пароли не совпадают';
  if (Object.keys(errors).length) throw new ValidationError(errors);

  if (await userModel.findByLogin(values.login)) throw new ValidationError({ login: 'Этот логин уже занят' });
  const idHash = lookupHash(values.idNumber);
  if (await clientModel.existsByIdHash(idHash)) {
    throw new ValidationError({ idNumber: 'Клиент с таким идентификационным номером уже подавал заявку' });
  }

  const passwordHash = await bcrypt.hash(values.password, BCRYPT_ROUNDS);
  return withTransaction(async (db) => {
    const userId = await userModel.create(db, { login: values.login, passwordHash, roleCode: 'client' });
    const clientId = await clientModel.create(db, {
      userId, lastName: values.lastName.trim(), firstName: values.firstName.trim(), patronymic: values.patronymic?.trim(),
      birthDate: values.birthDate, phone: values.phone, email: values.email?.trim(),
      idNumberEnc: encrypt(values.idNumber), idNumberHash: idHash, passportEnc: encrypt(values.passport)
    });
    await auditService.log({ userId, action: 'client.register', entity: 'client', entityId: clientId, ip }, db);
    return { userId, clientId };
  });
}

/**
 * Проверка логина и пароля с блокировкой после серии неудач.
 * Одинаковое сообщение для неверного логина и пароля, чтобы нельзя было перебирать логины.
 * @returns {Promise<import('../models/userModel.js').UserRow>}
 */
export async function login(loginName, password, ip) {
  const generic = new AppError('Неверный логин или пароль', 401, 'bad_credentials');
  const user = await userModel.findByLogin(String(loginName ?? '').trim().toLowerCase());
  if (!user) {
    // сравнение с фиктивным хэшем выравнивает время ответа
    await bcrypt.compare(String(password ?? ''), DUMMY_HASH);
    await auditService.log({ action: 'auth.login', result: 'failure', ip, details: { login: loginName } });
    throw generic;
  }
  if (user.status === 'blocked') throw new AppError('Учётная запись заблокирована. Обратитесь в банк', 403, 'blocked');
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Слишком много неудачных попыток входа. Повторите позже', 429, 'locked');
  }
  const ok = await bcrypt.compare(String(password ?? ''), user.password_hash);
  if (!ok) {
    await userModel.registerFailedLogin(user.id, config.login.maxAttempts, config.login.lockMinutes);
    await auditService.log({ userId: user.id, action: 'auth.login', result: 'failure', ip });
    throw generic;
  }
  await userModel.registerSuccessfulLogin(user.id);
  await auditService.log({ userId: user.id, action: 'auth.login', ip });
  return user;
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
