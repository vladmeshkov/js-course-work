import { query, withTransaction } from '../db/pool.js';
import { AppError, BusinessError, ValidationError } from '../lib/errors.js';
import { check, rules } from '../lib/validate.js';
import * as userModel from '../models/userModel.js';
import * as auditService from './auditService.js';
import { hashPassword } from './authService.js';

export async function listUsers({ q = '', role = '' } = {}) {
  const params = [];
  const where = [];
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(u.login) LIKE $${params.length} OR lower(c.last_name) LIKE $${params.length})`); }
  if (role) { params.push(role); where.push(`r.code = $${params.length}`); }
  const { rows } = await query(
    `SELECT u.id, u.login, u.status, u.last_login_at, u.created_at, r.code AS role_code, r.name AS role_name,
            c.last_name, c.first_name
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN clients c ON c.user_id = u.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.id LIMIT 300`, params);
  return rows;
}

export async function listRoles() {
  return (await query('SELECT code, name FROM roles ORDER BY id')).rows;
}

/** Блокировка и разблокировка. Себя заблокировать нельзя. */
export async function setBlocked(adminId, userId, blocked) {
  if (adminId === userId) throw new BusinessError('Нельзя заблокировать собственную учётную запись');
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Пользователь не найден', 404);
  await userModel.setStatus(userId, blocked ? 'blocked' : 'active');
  await auditService.log({ userId: adminId, action: blocked ? 'user.block' : 'user.unblock', entity: 'user', entityId: userId, details: { login: user.login } });
}

/** Создание учётной записи сотрудника. Клиенты регистрируются сами. */
export async function createStaff(adminId, { login, password, roleCode }) {
  const values = { login: String(login ?? '').trim().toLowerCase(), password };
  const errors = check(values, { login: [rules.login], password: [rules.password] });
  const role = (await listRoles()).find((r) => r.code === roleCode);
  if (!role || role.code === 'client') errors.roleCode = 'Выберите роль сотрудника';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (await userModel.findByLogin(values.login)) throw new ValidationError({ login: 'Этот логин уже занят' });
  const passwordHash = await hashPassword(password);
  return withTransaction(async (db) => {
    const id = await userModel.create(db, { login: values.login, passwordHash, roleCode });
    await auditService.log({ userId: adminId, action: 'user.create', entity: 'user', entityId: id, details: { login: values.login, role: roleCode } }, db);
    return id;
  });
}

export async function changeRole(adminId, userId, roleCode) {
  if (adminId === userId) throw new BusinessError('Нельзя менять собственную роль');
  const role = (await listRoles()).find((r) => r.code === roleCode);
  if (!role) throw new ValidationError({ roleCode: 'Выберите роль' });
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Пользователь не найден', 404);
  if ((user.role_code === 'client') !== (roleCode === 'client')) throw new BusinessError('Клиента нельзя сделать сотрудником и наоборот');
  await query('UPDATE users SET role_id = (SELECT id FROM roles WHERE code = $2) WHERE id = $1', [userId, roleCode]);
  await auditService.log({ userId: adminId, action: 'user.role', entity: 'user', entityId: userId, details: { from: user.role_code, to: roleCode } });
}

/** Журнал аудита с фильтрами. */
export async function auditLog({ login = '', action = '', result = '', days = 0 } = {}, limit = 200) {
  const params = [];
  const where = [];
  if (login) { params.push(`%${login.toLowerCase()}%`); where.push(`lower(u.login) LIKE $${params.length}`); }
  if (action) { params.push(`${action}%`); where.push(`a.action LIKE $${params.length}`); }
  if (result) { params.push(result); where.push(`a.result = $${params.length}`); }
  if (days) { params.push(days); where.push(`a.at >= now() - make_interval(days => $${params.length})`); }
  params.push(limit);
  const { rows } = await query(
    `SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.result, a.ip, a.details, u.login
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT $${params.length}`, params);
  return rows;
}
