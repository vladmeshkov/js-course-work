import * as auditModel from '../models/auditModel.js';

/**
 * Записывает событие в журнал аудита. Можно передать клиент транзакции, чтобы запись
 * попала в ту же транзакцию, что и операция.
 * @param {{userId?:number, action:string, entity?:string, entityId?:string|number, result?:'success'|'failure', ip?:string, details?:object}} event
 * @param {import('pg').PoolClient} [db]
 */
export function log(event, db) {
  return auditModel.insert(db, event);
}

export function latest(limit) {
  return auditModel.latest(limit);
}
