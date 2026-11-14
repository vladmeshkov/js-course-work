import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, generateSecret, hotp, totp, verify, otpauthUrl, stepOf } from '../../server/modules/auth/totp.js';

// секрет из RFC 6238: ASCII «12345678901234567890»
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('совпадает с контрольными значениями из RFC 4226 и RFC 6238', () => {
    // RFC 4226, приложение D
    expect(['755224', '287082', '359152', '969429'].every((code, i) => hotp(RFC_SECRET, i) === code)).toBe(true);
    // RFC 6238, приложение B (восемь цифр), SHA-1
    expect(hotp(RFC_SECRET, stepOf(59 * 1000), 8)).toBe('94287082');
    expect(hotp(RFC_SECRET, stepOf(1111111109 * 1000), 8)).toBe('07081804');
    expect(hotp(RFC_SECRET, stepOf(2000000000 * 1000), 8)).toBe('69279037');
  });

  it('использованный интервал повторно не принимается', () => {
    const secret = generateSecret();
    const now = Date.now();
    const step = verify(secret, totp(secret, now), { timeMs: now });
    expect(verify(secret, totp(secret, now), { timeMs: now, lastStep: step })).toBeNull();
  });

});
