import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, percentOf, roundMinor } from '../../server/shared/money.js';
import { buildIban, isValidIban, formatIban } from '../../server/shared/iban.js';
import { isValidCardNumber, luhnCheckDigit } from '../../server/modules/cards/luhn.js';
import { encrypt, decrypt, lookupHash } from '../../server/shared/crypto.js';

describe('money', () => {
  it('отклоняет неверные суммы', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('округляет до копейки, половина вверх', () => {
    expect(roundMinor(10.5)).toBe(11);
    expect(percentOf(10000, 1.5)).toBe(150);
    expect(percentOf(333, 0.5)).toBe(2);
    // ровно половина копейки округляется вверх, хотя в двоичной дроби 11000 * 0,35 / 100 = 38,4999…
    expect(percentOf(11000, 0.35)).toBe(39);
    expect(percentOf(-11000, 0.35)).toBe(-39);
    expect(percentOf(12345, 0.1)).toBe(12);
  });
});

describe('iban', () => {
  it('находит ошибку в номере', () => {
    const iban = buildIban('TLRB', '2400', 12345);
    const broken = iban.slice(0, 27) + (iban[27] === '0' ? '1' : '0');
    expect(isValidIban(broken)).toBe(false);
    expect(isValidIban('BY00')).toBe(false);
  });
});


describe('crypto', () => {
  it('обнаруживает подмену шифртекста', () => {
    const [iv, tag, data] = encrypt('секрет').split(':');
    const forged = [iv, tag, Buffer.from('другое').toString('base64')].join(':');
    expect(() => decrypt(forged)).toThrow();
    expect(data).toBeTruthy();
  });
});
