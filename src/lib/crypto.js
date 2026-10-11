import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Шифрует строку AES-256-GCM. Результат: «iv:тег:шифртекст» в base64.
 * @param {string} plain
 */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.dataKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

/**
 * Расшифровывает строку, полученную из encrypt().
 * @param {string} payload
 */
export function decrypt(payload) {
  const [iv, tag, data] = payload.split(':').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.dataKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Детерминированный хэш для поиска по зашифрованному полю и проверки дублей. */
export function lookupHash(value) {
  return crypto.createHmac('sha256', config.dataKey).update(value).digest('hex');
}

/** Случайный числовой код нужной длины (для OTP). */
export function randomCode(length = 6) {
  return String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');
}
