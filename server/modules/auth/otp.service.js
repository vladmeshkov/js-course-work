import { query, withTransaction } from '../../db/pool.js';
import { lookupHash, randomCode } from '../../shared/crypto.js';
import { AppError } from '../../shared/errors.js';

const TTL_MINUTES = 5;
const MAX_ATTEMPTS = 3;

/**
 * Выдаёт одноразовый код для операции. Предыдущие неиспользованные коды той же операции аннулируются.
 * Код отправляет mailService.sendCode письмом на почту клиента; сама функция возвращает код (для тестов и учебного режима без почты).
 * @param {number} userId
 * @param {string} purpose например "transfer:<id>"
 * @returns {Promise<string>} код
 */
export async function issue(userId, purpose, db = { query }) {
  const code = randomCode(6);
  await db.query('UPDATE otp_codes SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  await db.query(
    `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL ? MINUTE)`,
    [userId, purpose, lookupHash(`${userId}:${purpose}:${code}`), TTL_MINUTES]
  );
  return code;
}

/**
 * Проверяет код. После успешной проверки код гасится. После 3 неверных попыток код аннулируется.
 * Проверка идёт в отдельной транзакции с блокировкой строки кода: параллельные запросы проверяются по очереди
 * и не могут получить больше попыток, чем MAX_ATTEMPTS. Счётчик неверных попыток фиксируется до ответа об ошибке.
 * @throws {AppError} если код неверный, просрочен или попытки исчерпаны
 */
export async function verify(userId, purpose, code) {
  const failure = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT id, code_hash, attempts FROM otp_codes
       WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [userId, purpose]
    );
    const row = rows[0];
    if (!row) return new AppError('Код недействителен или истёк. Запросите новый', 400, 'otp_expired');
    if (lookupHash(`${userId}:${purpose}:${String(code ?? '').trim()}`) !== row.code_hash) {
      const attempts = row.attempts + 1;
      // после последней попытки код гасится
      await db.query('UPDATE otp_codes SET used_at = IF(? >= ?, UTC_TIMESTAMP(3), NULL), attempts = ? WHERE id = ?',
        [attempts, MAX_ATTEMPTS, attempts, row.id]);
      const left = MAX_ATTEMPTS - attempts;
      return new AppError(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Попытки исчерпаны, запросите новый', 400, 'otp_wrong');
    }
    await db.query('UPDATE otp_codes SET used_at = UTC_TIMESTAMP(3) WHERE id = ?', [row.id]);
    return null;
  });
  if (failure) throw failure;
}
