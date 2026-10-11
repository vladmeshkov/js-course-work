import crypto from 'node:crypto';

/*
 * TOTP по RFC 6238: одноразовый код из общего секрета и времени.
 * HMAC-SHA1, шаг 30 секунд, 6 цифр: совместимо с Google Authenticator, Яндекс Ключом, Aegis и др.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function base32Decode(text) {
  let bits = '';
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('Недопустимый символ в секрете');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Новый случайный секрет: 20 байт (160 бит) в кодировке base32. */
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** Код HOTP для номера интервала. */
export function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export const stepOf = (timeMs) => Math.floor(timeMs / 1000 / STEP_SECONDS);

export function totp(secret, timeMs = Date.now(), digits = 6) {
  return hotp(secret, stepOf(timeMs), digits);
}

/**
 * Проверяет код с допуском на расхождение часов (по два интервала в обе стороны, то есть плюс-минус минута).
 * Интервалы, не новее lastStep, отклоняются: один и тот же код нельзя использовать дважды.
 * @returns {number | null} номер подошедшего интервала или null
 */
export function verify(secret, token, { timeMs = Date.now(), window = 2, lastStep = null } = {}) {
  const code = String(token ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepOf(timeMs);
  for (let step = current - window; step <= current + window; step++) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** Ссылка для приложения-аутентификатора (её кодирует QR). */
export function otpauthUrl({ secret, account, issuer = 'ТалерБанк' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
