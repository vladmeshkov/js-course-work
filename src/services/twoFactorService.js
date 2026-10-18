import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { query, withTransaction } from '../db/pool.js';
import { decrypt, encrypt, lookupHash } from '../lib/crypto.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { generateSecret, otpauthUrl, verify } from '../lib/totp.js';
import * as settingsModel from '../models/settingsModel.js';
import * as userModel from '../models/userModel.js';
import * as auditService from './auditService.js';
import * as notificationService from './notificationService.js';

/*
 * Двухфакторная аутентификация (TOTP).
 * Включение: сервер выдаёт секрет и QR, пользователь вводит код из приложения, после этого 2FA включается
 * и выдаются 10 резервных кодов (хранятся только хэши, показываются один раз).
 * Вход: после пароля требуется код из приложения или резервный код. Секрет хранится зашифрованным (AES-256-GCM).
 */

const RECOVERY_COUNT = 10;

/** Новые параметры настройки: секрет, ссылка для приложения и QR в виде SVG. */
export async function beginSetup(user) {
  if (user.totp_enabled) throw new BusinessError('Двухфакторная защита уже включена');
  const secret = generateSecret();
  const url = otpauthUrl({ secret, account: user.login });
  return { secret, url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 220 }) };
}

/** QR для повторного показа того же секрета (если пользователь ошибся в коде). */
export async function qrFor(user, secret) {
  const url = otpauthUrl({ secret, account: user.login });
  return { secret, url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 220 }) };
}

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Подтверждает настройку кодом из приложения и включает 2FA.
 * @returns {Promise<string[]>} резервные коды
 */
export async function confirmSetup(user, secret, code) {
  if (user.totp_enabled) throw new BusinessError('Двухфакторная защита уже включена');
  const step = verify(secret, code);
  if (step === null) throw new ValidationError({ code: 'Неверный код. Проверьте время на телефоне и попробуйте ещё раз' });
  const codes = newRecoveryCodes();
  await withTransaction(async (db) => {
    await db.query('UPDATE users SET totp_secret_enc = ?, totp_enabled = true, totp_last_step = ? WHERE id = ?', [encrypt(secret), step, user.id]);
    await db.query('DELETE FROM recovery_codes WHERE user_id = ?', [user.id]);
    for (const c of codes) await db.query('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)', [user.id, lookupHash(normalizeCode(c))]);
    await auditService.log({ userId: user.id, action: '2fa.enable', entity: 'user', entityId: user.id }, db);
    await notificationService.notify(user.id, { type: 'security', title: 'Включена двухфакторная защита', body: 'Вход в кабинет теперь требует код из приложения-аутентификатора.', link: '/security' }, db);
  });
  return codes;
}

/**
 * Проверка второго фактора при входе: код из приложения или резервный код.
 * @returns {Promise<boolean>}
 */
export async function verifyLogin(userId, code) {
  const user = await userModel.findById(userId);
  if (!user || !user.totp_enabled) return false;
  const step = verify(decrypt(user.totp_secret_enc), code, { lastStep: user.totp_last_step === null ? null : Number(user.totp_last_step) });
  if (step !== null) {
    // условие step > last защищает от гонки двух одновременных входов с одним кодом
    const { rowCount } = await query('UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)', [step, userId, step]);
    return rowCount === 1;
  }
  const hash = lookupHash(normalizeCode(code));
  if (!hash || normalizeCode(code).length < 8) return false;
  const { rowCount } = await query('UPDATE recovery_codes SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND code_hash = ? AND used_at IS NULL', [userId, hash]);
  if (rowCount === 1) {
    await auditService.log({ userId, action: '2fa.recovery_used', entity: 'user', entityId: userId });
    await notificationService.notify(userId, { type: 'security', title: 'Вход по резервному коду', body: 'Использован один из резервных кодов. Проверьте, что это были вы.', link: '/security' });
    return true;
  }
  return false;
}

export async function recoveryLeft(userId) {
  const { rows } = await query('SELECT count(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
  return rows[0].n;
}

/** Отключение: нужен пароль и действующий код. */
export async function disable(user, password, code) {
  const fresh = await userModel.findById(user.id);
  if (!fresh.totp_enabled) throw new BusinessError('Двухфакторная защита не включена');
  if (fresh.role_code !== 'client' && (await settingsModel.getNumber('security.require_2fa_staff')) === 1) {
    throw new BusinessError('Для сотрудников банка двухфакторная защита обязательна, отключить её нельзя');
  }
  if (!(await bcrypt.compare(String(password ?? ''), fresh.password_hash))) throw new ValidationError({ password: 'Неверный пароль' });
  if (!(await verifyLogin(user.id, code))) throw new ValidationError({ code: 'Неверный код' });
  await withTransaction(async (db) => {
    await db.query('UPDATE users SET totp_enabled = false, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?', [user.id]);
    await db.query('DELETE FROM recovery_codes WHERE user_id = ?', [user.id]);
    await auditService.log({ userId: user.id, action: '2fa.disable', entity: 'user', entityId: user.id }, db);
    await notificationService.notify(user.id, { type: 'security', title: 'Двухфакторная защита отключена', body: 'Если это были не вы, срочно смените пароль и обратитесь в банк.', link: '/security' }, db);
  });
}

export { AppError };
