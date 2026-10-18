import { query } from '../db/pool.js';
import { listBackups } from './backupService.js';
import * as ledgerService from './ledgerService.js';

const count = async (sql, params = []) => (await query(sql, params)).rows[0].n;

/**
 * Главная сотрудника: показатели и ближайшие задачи только по тем разделам, на которые у роли есть права.
 * @param {{permissions:string[]}} user
 */
export async function forUser(user) {
  const can = (p) => user.permissions.includes(p);
  const { rows: [state] } = await query('SELECT bank_date FROM bank_state');
  const metrics = [];
  const queues = [];

  if (can('kyc.review')) {
    const rows = (await query(
      `SELECT c.id, c.last_name, c.first_name, c.created_at FROM clients c WHERE c.kyc_status = 'submitted' ORDER BY c.id LIMIT 5`)).rows;
    const n = await count("SELECT count(*) AS n FROM clients WHERE kyc_status = 'submitted'");
    metrics.push({ label: 'Анкеты на проверке', value: n, href: '/staff/kyc', hot: n > 0 });
    queues.push({ title: 'Анкеты на проверке', href: '/staff/kyc', empty: 'Новых анкет нет.',
      items: rows.map((r) => ({ title: `${r.last_name} ${r.first_name}`, meta: `подана ${new Date(r.created_at).toISOString().slice(0, 10)}`, href: `/staff/kyc/${r.id}` })) });
  }
  if (can('cash.operate')) {
    metrics.push({ label: 'Кассовых операций сегодня', value: await count(
      "SELECT count(*) AS n FROM documents WHERE type IN ('cash_in', 'cash_out') AND bank_date = ?", [state.bank_date]), href: '/staff/cash' });
  }
  if (can('account.freeze')) {
    metrics.push({ label: 'Заблокированных счетов', value: await count("SELECT count(*) AS n FROM accounts WHERE status = 'frozen'"), href: '/staff/accounts' });
  }
  if (can('loan.review')) {
    const rows = (await query(
      `SELECT a.id, a.amount, a.score, c.last_name, c.first_name FROM loan_applications a JOIN clients c ON c.id = a.client_id
       WHERE a.status = 'manual_review' ORDER BY a.id LIMIT 5`)).rows;
    const n = await count("SELECT count(*) AS n FROM loan_applications WHERE status = 'manual_review'");
    metrics.push({ label: 'Заявки на кредит', value: n, href: '/staff/loans', hot: n > 0 });
    metrics.push({ label: 'Кредитов с просрочкой', value: await count(
      "SELECT count(DISTINCT loan_id) AS n FROM loan_schedule WHERE status = 'overdue'"), href: '/admin/reports' });
    queues.push({ title: 'Заявки на кредит', href: '/staff/loans', empty: 'Заявок на рассмотрении нет.',
      items: rows.map((r) => ({ title: `${r.last_name} ${r.first_name}`, meta: `балл ${r.score}, сумма ${(r.amount / 100).toFixed(2).replace('.', ',')} BYN`, href: `/staff/loans/${r.id}` })) });
  }
  if (can('fraud.review')) {
    const rows = (await query(
      `SELECT f.id, f.score, f.amount_byn, u.login FROM fraud_cases f JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.id LIMIT 5`)).rows;
    const n = await count("SELECT count(*) AS n FROM fraud_cases WHERE status = 'open'");
    metrics.push({ label: 'Задержанные переводы', value: n, href: '/staff/fraud', hot: n > 0 });
    queues.push({ title: 'Задержанные переводы', href: '/staff/fraud', empty: 'Очередь пуста.',
      items: rows.map((r) => ({ title: r.login, meta: `риск ${r.score} баллов, ${(r.amount_byn / 100).toFixed(2).replace('.', ',')} BYN`, href: `/staff/fraud/${r.id}` })) });
  }

  let admin = null;
  if (can('users.manage') || can('audit.view') || can('eod.run') || can('backup.manage')) {
    const trial = can('eod.run') ? await ledgerService.trialBalance({ query }) : [];
    const backups = can('backup.manage') ? await listBackups() : [];
    const events = can('audit.view') ? (await query(
      `SELECT a.at, a.action, a.result, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 6`)).rows : [];
    if (can('users.manage')) {
      metrics.push({ label: 'Пользователей', value: await count('SELECT count(*) AS n FROM users'), href: '/admin/users' });
      metrics.push({ label: 'Заблокировано', value: await count("SELECT count(*) AS n FROM users WHERE status = 'blocked'"), href: '/admin/users' });
    }
    if (can('audit.view')) {
      metrics.push({ label: 'Неудачных входов за сутки', value: await count(
        "SELECT count(*) AS n FROM audit_log WHERE action = 'auth.login' AND result = 'failure' AND at > UTC_TIMESTAMP(3) - INTERVAL 1 DAY"), href: '/admin/audit' });
    }
    admin = {
      balanced: trial.every((t) => t.ok),
      showTrial: can('eod.run'),
      lastBackup: backups[0] ? new Date(backups[0].createdAt).toISOString().slice(0, 16).replace('T', ' ') : null,
      showBackup: can('backup.manage'),
      events
    };
  }
  return { bankDate: String(state.bank_date).slice(0, 10), metrics, queues, admin };
}
