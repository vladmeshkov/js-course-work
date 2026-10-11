import { pool } from '../db/pool.js';
import { AppError, ValidationError } from '../lib/errors.js';
import * as adminService from '../services/adminService.js';
import * as eodService from '../services/eodService.js';
import * as ledgerService from '../services/ledgerService.js';
import * as settingsService from '../services/settingsService.js';

export async function showEod(req, res) {
  res.render('pages/admin/eod', {
    title: 'Операционный день',
    bankDate: await eodService.currentBankDate(pool),
    balance: await ledgerService.trialBalance(pool),
    result: null
  });
}

export async function runEod(req, res) {
  const days = Math.min(Math.max(Number(req.body.days) || 1, 1), 400);
  const result = await eodService.advanceDays(req.user.id, days);
  req.flash('success', `Операционный день закрыт, новая банковская дата: ${result.date}`);
  res.redirect('/admin/eod');
}

async function renderRates(req, res, { errors = {}, status = 200 } = {}) {
  res.status(status).render('pages/admin/rates', {
    title: 'Курсы и тарифы', spreads: await settingsService.spreads(), groups: await settingsService.list(), errors
  });
}

export const showRates = (req, res) => renderRates(req, res);

export async function saveSpreads(req, res) {
  try {
    const values = {};
    for (const key of Object.keys(req.body)) {
      const m = /^(\w{3})_(buy|sell)$/.exec(key);
      if (m) (values[m[1]] ??= {})[m[2]] = req.body[key];
    }
    await settingsService.updateSpreads(req.user.id, values);
    req.flash('success', 'Спред сохранён');
    res.redirect('/admin/rates');
  } catch (error) {
    if (error instanceof ValidationError) return renderRates(req, res, { errors: error.fields, status: 422 });
    throw error;
  }
}

export async function refreshRates(req, res) {
  const source = await settingsService.refreshFromNbrb(req.user.id);
  req.flash(source === 'nbrb' ? 'success' : 'info', source === 'nbrb' ? 'Курсы обновлены с сайта Нацбанка' : 'Нацбанк недоступен, оставлены запасные курсы');
  res.redirect('/admin/rates');
}

export async function saveSettings(req, res) {
  try {
    const changed = await settingsService.update(req.user.id, req.body);
    req.flash('success', changed ? `Сохранено изменений: ${changed}` : 'Изменений нет');
    res.redirect('/admin/rates');
  } catch (error) {
    if (error instanceof ValidationError) return renderRates(req, res, { errors: error.fields, status: 422 });
    throw error;
  }
}

async function renderUsers(req, res, { errors = {}, form = {}, status = 200 } = {}) {
  const q = String(req.query.q ?? '');
  const role = String(req.query.role ?? '');
  res.status(status).render('pages/admin/users', {
    title: 'Пользователи', users: await adminService.listUsers({ q, role }), roles: await adminService.listRoles(), q, role, errors, form
  });
}

export const showUsers = (req, res) => renderUsers(req, res);

export async function blockUser(req, res) {
  await adminService.setBlocked(req.user.id, Number(req.params.id), req.body.action !== 'unblock');
  req.flash('success', req.body.action === 'unblock' ? 'Пользователь разблокирован' : 'Пользователь заблокирован');
  res.redirect('/admin/users');
}

export async function createUser(req, res) {
  try {
    await adminService.createStaff(req.user.id, req.body);
    req.flash('success', 'Сотрудник добавлен');
    res.redirect('/admin/users');
  } catch (error) {
    if (error instanceof ValidationError) return renderUsers(req, res, { errors: error.fields, form: { login: req.body.login, roleCode: req.body.roleCode }, status: 422 });
    throw error;
  }
}

export async function changeRole(req, res) {
  await adminService.changeRole(req.user.id, Number(req.params.id), req.body.roleCode);
  req.flash('success', 'Роль изменена');
  res.redirect('/admin/users');
}

export async function showAudit(req, res) {
  const filters = { login: String(req.query.login ?? ''), action: String(req.query.action ?? ''), result: String(req.query.result ?? '') };
  res.render('pages/admin/audit', { title: 'Журнал аудита', rows: await adminService.auditLog(filters), filters });
}

export { AppError };
