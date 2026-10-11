/** Алгоритм Луна для номеров банковских карт. */

/** @param {string} digits номер карты без последней контрольной цифры */
export function luhnCheckDigit(digits) {
  let sum = 0;
  const reversed = [...digits].reverse();
  reversed.forEach((ch, i) => {
    let n = Number(ch);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return (10 - (sum % 10)) % 10;
}

/** @param {string} number полный номер карты */
export function isValidCardNumber(number) {
  const clean = String(number ?? '').replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(clean)) return false;
  return luhnCheckDigit(clean.slice(0, -1)) === Number(clean.slice(-1));
}
