import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { AppError } from '../shared/errors.js';

/**
 * Соединение для запросов: пул или клиент транзакции (withTransaction). Модели и сервисы получают его параметром db.
 * @typedef {{query: (sql: string, params?: any[]) => Promise<{rows: any[], rowCount: number, insertId: number}>}} Db
 */

/**
 * Пул соединений MySQL. Суммы хранятся в копейках (BIGINT) и помещаются в безопасный диапазон Number,
 * DECIMAL (результат SUM) приводится к числу, DATE остаётся строкой «ГГГГ-ММ-ДД», чтобы не зависеть от часового пояса,
 * TINYINT(1) возвращается как boolean. Время хранится в UTC.
 */
const rawPool = mysql.createPool({
  uri: config.databaseUrl,
  charset: 'utf8mb4',
  timezone: 'Z',
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: true,
  flags: ['+FOUND_ROWS'],
  namedPlaceholders: false,
  typeCast(field, next) {
    if (field.type === 'DATE') return field.string();
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  }
});

// Каждое соединение работает в UTC и с уровнем изоляции READ COMMITTED (строки блокируются через SELECT ... FOR UPDATE).
rawPool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00', transaction_isolation = 'READ-COMMITTED'");
});

/**
 * Приводит ответ mysql2 к единому виду { rows, rowCount, insertId }.
 * Для SELECT rows содержит строки, для INSERT, UPDATE и DELETE rowCount равен числу затронутых строк.
 */
function adapt([result]) {
  if (Array.isArray(result)) return { rows: result, rowCount: result.length, insertId: 0 };
  return { rows: [], rowCount: result.affectedRows ?? 0, insertId: Number(result.insertId ?? 0) };
}

/** Обёртка над соединением или пулом: db.query(sql, params) с плейсхолдерами «?», массивы раскрываются в IN (?). */
function wrap(target) {
  return { query: async (sql, params = []) => adapt(await target.query(sql, params.map(safeParam))) };
}

/**
 * NaN и Infinity mysql2 подставил бы в SQL как текст (WHERE id = NaN) и получил бы ошибку синтаксиса.
 * Такие значения передаются как NULL: запрос просто ничего не найдёт, а сервис ответит «не найдено».
 */
function safeParam(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) return value.map(safeParam);
  return value;
}

export const pool = {
  ...wrap(rawPool),
  /** Закрывает все соединения. */
  end: () => rawPool.end(),
  /** Соединение для служебных задач (миграции, резервное копирование). */
  getConnection: () => rawPool.getConnection()
};

/**
 * Выполняет запрос вне транзакции.
 * @param {string} text
 * @param {any[]} [params]
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Выполняет функцию в одной транзакции. При исключении транзакция откатывается.
 * Каждая денежная операция должна выполняться через эту функцию.
 * @template T
 * @param {(db: { query: (sql: string, params?: any[]) => Promise<{ rows: any[], rowCount: number, insertId: number }> }) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const connection = await rawPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(wrap(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Выполняет часть работы внутри точки сохранения. При ошибке откатывается только эта часть,
 * транзакция продолжается, ошибка бизнес-правила возвращается вызывающему коду (а не выбрасывается).
 * Нужна при закрытии дня: неудача одного платежа не должна отменять весь день.
 * @param {{query: Function}} db
 * @param {(db:{query:Function}) => Promise<any>} work
 * @returns {Promise<{ok:true, value:any} | {ok:false, error:Error}>}
 */
export async function withSavepoint(db, work) {
  await db.query('SAVEPOINT step');
  try {
    const value = await work(db);
    await db.query('RELEASE SAVEPOINT step');
    return { ok: true, value };
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT step');
    // ошибки бизнес-правил (нет денег, счёт заблокирован) возвращаются, ошибки программы и SQL пробрасываются
    if (!(error instanceof AppError)) throw error;
    return { ok: false, error };
  }
}

/** Нарушение уникальности (повторная запись с тем же значением). */
export const isDuplicate = (error) => error?.code === 'ER_DUP_ENTRY';
