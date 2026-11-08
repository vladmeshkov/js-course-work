/**
 * IBAN Беларуси: «BY» + 2 контрольные цифры + 4 символа кода банка
 * + 4 символа кода балансового счёта + 16 цифр номера счёта (всего 28 символов).
 */

/** Заменяет буквы числами (A=10 ... Z=35) для расчёта по mod 97. */
function toDigits(text) {
  return [...text].map((ch) => (/[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch)).join('');
}

function mod97(digits) {
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

/**
 * Строит IBAN и считает контрольные цифры (ISO 13616).
 * @param {string} bankCode 4 символа
 * @param {string} balanceCode 4 символа
 * @param {number | string} accountNumber номер счёта, будет дополнен нулями до 16 цифр
 */
export function buildIban(bankCode, balanceCode, accountNumber) {
  const number = String(accountNumber).padStart(16, '0');
  if (!/^[A-Z0-9]{4}$/.test(bankCode) || !/^[A-Z0-9]{4}$/.test(balanceCode) || !/^\d{16}$/.test(number)) {
    throw new Error('Некорректные части номера счёта');
  }
  const bban = bankCode + balanceCode + number;
  const check = String(98 - mod97(toDigits(bban + 'BY00'))).padStart(2, '0');
  return `BY${check}${bban}`;
}

/**
 * Проверяет IBAN: длина, символы и контрольные цифры.
 * @param {string} iban можно с пробелами и в нижнем регистре
 */
export function isValidIban(iban) {
  const text = String(iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^BY\d{2}[A-Z0-9]{24}$/.test(text)) return false;
  return mod97(toDigits(text.slice(4) + text.slice(0, 4))) === 1;
}

/** Группирует по четыре символа для показа: «BY20 TLRB 3014 ...». */
export function formatIban(iban) {
  return String(iban).replace(/(.{4})/g, '$1 ').trim();
}
