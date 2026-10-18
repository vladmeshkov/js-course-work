import { pool } from '../db/pool.js';
import { ValidationError } from '../lib/errors.js';
import * as backupService from '../services/backupService.js';
import * as reportService from '../services/reportService.js';
import * as interbankService from '../services/interbankService.js';
import * as adminService from '../services/adminService.js';
import * as eodService from '../services/eodService.js';
import * as ledgerService from '../services/ledgerService.js';
import * as settingsService from '../services/settingsService.js';

const CURRENCIES = ['BYN', 'USD', 'EUR', 'RUB', 'CNY'];

/** Операционный день: текущая банковская дата и контроль двойной записи по валютам. */
export async function eod(req, res) {
  res.json({ bankDate: await eodService.currentBankDate(pool), balance: await ledgerService.trialBalance(pool) });
}

/** Закрывает один или несколько дней подряд (для показа). Возвращает итог последнего дня и обновлённые данные страницы. */
export async function runEod(req, res) {
  const days = Math.min(Math.max(Number(req.body.days) || 1, 1), 400);
  const result = await eodService.advanceDays(req.user.id, days);
  res.json({
    ...result, days, bankDate: result.date, balance: await ledgerService.trialBalance(pool),
    message: `Операционный день закрыт, новая банковская дата: ${result.date}`
  });
}

/** Курсы и тарифы: спреды по валютам и настройки лимитов, комиссий и порогов по группам. */
export async function rates(req, res) {
  res.json({ spreads: await settingsService.spreads(), groups: await settingsService.list() });
}

/** Сохранение спредов. Поля тела запроса называются «USD_buy», «USD_sell» и т. д. */
export async function saveSpreads(req, res) {
  const values = {};
  for (const key of Object.keys(req.body)) {
    const m = /^(\w{3})_(buy|sell)$/.exec(key);
    if (m) (values[m[1]] ??= {})[m[2]] = req.body[key];
  }
  await settingsService.updateSpreads(req.user.id, values);
  res.json({ status: 'ok', message: 'Спред сохранён', spreads: await settingsService.spreads() });
}

/** Обновление курсов с сайта Нацбанка. Если сайт недоступен, остаются запасные курсы. */
export async function refreshRates(req, res) {
  const source = await settingsService.refreshFromNbrb(req.user.id);
  res.json({
    status: 'ok', source, level: source === 'nbrb' ? 'success' : 'info',
    message: source === 'nbrb' ? 'Курсы обновлены с сайта Нацбанка' : 'Нацбанк недоступен, оставлены запасные курсы',
    spreads: await settingsService.spreads()
  });
}

/** Сохранение лимитов, комиссий и порогов. Ключи тела запроса совпадают с ключами настроек. */
export async function saveSettings(req, res) {
  const changed = await settingsService.update(req.user.id, req.body);
  res.json({ status: 'ok', changed, message: changed ? `Сохранено изменений: ${changed}` : 'Изменений нет', groups: await settingsService.list() });
}

/** Список пользователей с поиском по фамилии или логину и фильтром по роли. */
export async function users(req, res) {
  const q = String(req.query.q ?? '');
  const role = String(req.query.role ?? '');
  res.json({ users: await adminService.listUsers({ q, role }), roles: await adminService.listRoles(), q, role });
}

/** Блокировка и разблокировка: в теле action равно «block» или «unblock». */
export async function blockUser(req, res) {
  const unblock = req.body.action === 'unblock';
  await adminService.setBlocked(req.user.id, Number(req.params.id), !unblock);
  res.json({ status: 'ok', blocked: !unblock, message: unblock ? 'Пользователь разблокирован' : 'Пользователь заблокирован' });
}

/** Создание сотрудника: логин, пароль и роль. */
export async function createUser(req, res) {
  const id = await adminService.createStaff(req.user.id, req.body);
  res.status(201).json({ status: 'ok', id, message: 'Сотрудник добавлен' });
}

export async function changeRole(req, res) {
  await adminService.changeRole(req.user.id, Number(req.params.id), req.body.roleCode);
  res.json({ status: 'ok', message: 'Роль изменена' });
}

/** Журнал аудита с фильтрами по пользователю, событию, результату и периоду (1, 3 или 7 суток). */
export async function audit(req, res) {
  const filters = {
    login: String(req.query.login ?? ''), action: String(req.query.action ?? ''), result: String(req.query.result ?? ''),
    days: [1, 3, 7].includes(Number(req.query.days)) ? Number(req.query.days) : 0
  };
  res.json({ rows: await adminService.auditLog(filters), filters });
}

export async function backups(req, res) {
  res.json({ backups: await backupService.listBackups() });
}

export async function createBackup(req, res) {
  const backup = await backupService.createBackup(req.user.id);
  res.status(201).json({ status: 'ok', backup, message: `Копия создана: ${backup.name}` });
}

/** Восстановление требует слово ВОССТАНОВИТЬ в поле confirm. */
export async function restoreBackup(req, res) {
  if (req.body.confirm !== 'ВОССТАНОВИТЬ') throw new ValidationError({ confirm: 'Для восстановления введите слово ВОССТАНОВИТЬ' });
  await backupService.restoreBackup(req.user.id, req.body.name);
  res.json({ status: 'ok', message: 'База данных восстановлена из копии' });
}

/** Отчёты: оборотно-сальдовая ведомость за период (ошибка периода даёт 422 с полем from) и показатели портфеля. */
export async function reports(req, res) {
  const { from, to } = req.query;
  const currency = CURRENCIES.includes(req.query.currency) ? req.query.currency : 'BYN';
  const trial = await reportService.trialBalance({ from, to, currency });
  res.json({ trial, portfolio: await reportService.portfolio(), currency });
}

export async function trialCsv(req, res) {
  const report = await reportService.trialBalance({ from: req.query.from, to: req.query.to, currency: req.query.currency });
  res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="osv-${report.to}.csv"`).send(reportService.trialBalanceCsv(report));
}

/** Клиринг: очередь на отправку, пакеты и банки-контрагенты. */
export async function clearing(req, res) {
  res.json(await interbankService.clearingOverview());
}
