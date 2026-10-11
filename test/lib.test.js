import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, percentOf, roundMinor } from '../src/lib/money.js';
import { buildIban, isValidIban, formatIban } from '../src/lib/iban.js';
import { isValidCardNumber, luhnCheckDigit } from '../src/lib/luhn.js';
import { encrypt, decrypt, lookupHash } from '../src/lib/crypto.js';

describe('money', () => {
  it('разбирает суммы в копейки', () => {
    expect(parseAmount('1 234,56')).toBe(123456);
    expect(parseAmount('10')).toBe(1000);
    expect(parseAmount('0.5')).toBe(50);
  });
  it('отклоняет неверные суммы', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('форматирует копейки', () => {
    expect(formatAmount(123456)).toBe('1 234,56');
    expect(formatAmount(5)).toBe('0,05');
    expect(formatAmount(-1000)).toBe('−10,00');
  });
  it('округляет до копейки, половина вверх', () => {
    expect(roundMinor(10.5)).toBe(11);
    expect(percentOf(10000, 1.5)).toBe(150);
    expect(percentOf(333, 0.5)).toBe(2);
  });
});

describe('iban', () => {
  it('строит IBAN с корректными контрольными цифрами', () => {
    const iban = buildIban('TLRB', '2400', 1);
    expect(iban).toHaveLength(28);
    expect(iban.startsWith('BY')).toBe(true);
    expect(isValidIban(iban)).toBe(true);
    expect(isValidIban(formatIban(iban).toLowerCase())).toBe(true);
  });
  it('находит ошибку в номере', () => {
    const iban = buildIban('TLRB', '2400', 12345);
    const broken = iban.slice(0, 27) + (iban[27] === '0' ? '1' : '0');
    expect(isValidIban(broken)).toBe(false);
    expect(isValidIban('BY00')).toBe(false);
  });
  it('известный пример из ISO 13616 проходит проверку', () => {
    expect(isValidIban('BY13NBRB3600900000002Z00AB00')).toBe(true);
  });
});

describe('luhn', () => {
  it('проверяет номер карты', () => {
    expect(isValidCardNumber('4111111111111111')).toBe(true);
    expect(isValidCardNumber('4111111111111112')).toBe(false);
    expect(luhnCheckDigit('411111111111111')).toBe(1);
  });
});

describe('crypto', () => {
  it('шифрует и расшифровывает, шифртекст каждый раз разный', () => {
    const a = encrypt('3010590A001PB4');
    const b = encrypt('3010590A001PB4');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('3010590A001PB4');
  });
  it('обнаруживает подмену шифртекста', () => {
    const [iv, tag, data] = encrypt('секрет').split(':');
    const forged = [iv, tag, Buffer.from('другое').toString('base64')].join(':');
    expect(() => decrypt(forged)).toThrow();
    expect(data).toBeTruthy();
  });
  it('хэш для поиска стабилен', () => {
    expect(lookupHash('abc')).toBe(lookupHash('abc'));
    expect(lookupHash('abc')).not.toBe(lookupHash('abd'));
  });
});
