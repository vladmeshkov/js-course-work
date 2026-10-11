import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, generateSecret, hotp, totp, verify, otpauthUrl, stepOf } from '../src/lib/totp.js';

// секрет из RFC 6238: ASCII «12345678901234567890»
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('base32 туда и обратно', () => {
    const buf = Buffer.from('Привет, банк');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(() => base32Decode('1!')).toThrow();
  });

  it('совпадает с контрольными значениями из RFC 4226 и RFC 6238', () => {
    // RFC 4226, приложение D
    expect(['755224', '287082', '359152', '969429'].every((code, i) => hotp(RFC_SECRET, i) === code)).toBe(true);
    // RFC 6238, приложение B (восемь цифр), SHA-1
    expect(hotp(RFC_SECRET, stepOf(59 * 1000), 8)).toBe('94287082');
    expect(hotp(RFC_SECRET, stepOf(1111111109 * 1000), 8)).toBe('07081804');
    expect(hotp(RFC_SECRET, stepOf(2000000000 * 1000), 8)).toBe('69279037');
  });

  it('принимает код текущего и соседних интервалов, отклоняет чужой', () => {
    const secret = generateSecret();
    const now = Date.UTC(2026, 9, 11, 12, 0, 10);
    expect(verify(secret, totp(secret, now), { timeMs: now })).toBe(stepOf(now));
    expect(verify(secret, totp(secret, now - 30000), { timeMs: now })).toBe(stepOf(now) - 1);
    expect(verify(secret, totp(secret, now + 30000), { timeMs: now })).toBe(stepOf(now) + 1);
    expect(verify(secret, totp(secret, now - 90000), { timeMs: now })).toBeNull();
    expect(verify(secret, '12345', { timeMs: now })).toBeNull();
    expect(verify(secret, 'abcdef', { timeMs: now })).toBeNull();
  });

  it('использованный интервал повторно не принимается', () => {
    const secret = generateSecret();
    const now = Date.now();
    const step = verify(secret, totp(secret, now), { timeMs: now });
    expect(verify(secret, totp(secret, now), { timeMs: now, lastStep: step })).toBeNull();
  });

  it('ссылка для аутентификатора содержит секрет и параметры', () => {
    const url = otpauthUrl({ secret: 'ABC', account: 'anna' });
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('secret=ABC');
    expect(url).toContain('period=30');
  });
});
