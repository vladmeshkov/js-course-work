/** Пункты верхнего меню в зависимости от роли. */

const GUEST = [
  { label: 'Вклады', href: '/deposits' },
  { label: 'Кредиты', href: '/loans' },
  { label: 'Курсы валют', href: '/rates' }
];

const CLIENT = [
  { label: 'Главная', href: '/cabinet' },
  { label: 'Счета и карты', href: '/accounts' },
  { label: 'Платежи и переводы', href: '/payments' },
  { label: 'Вклады', href: '/deposits' },
  { label: 'Кредиты', href: '/loans' }
];

const STAFF = [{ label: 'Рабочее место', href: '/workplace' }];

export function navFor(user) {
  if (!user) return GUEST;
  if (user.role_code === 'client') return CLIENT;
  const items = [...STAFF];
  if (user.permissions.includes('kyc.review')) items.push({ label: 'Анкеты', href: '/staff/kyc' });
  if (user.permissions.includes('cash.operate')) items.push({ label: 'Касса', href: '/staff/cash' });
  if (user.permissions.includes('account.freeze')) items.push({ label: 'Счета клиентов', href: '/staff/accounts' });
  if (user.permissions.includes('loan.review')) items.push({ label: 'Заявки на кредит', href: '/staff/loans' });
  if (user.permissions.includes('fraud.review')) items.push({ label: 'Антифрод', href: '/staff/fraud' });
  if (user.permissions.includes('reports.view')) items.push({ label: 'Отчёты', href: '/admin/reports' });
  if (user.permissions.includes('rates.manage')) items.push({ label: 'Курсы и тарифы', href: '/admin/rates' });
  if (user.permissions.includes('users.manage')) items.push({ label: 'Пользователи', href: '/admin/users' });
  if (user.permissions.includes('audit.view')) items.push({ label: 'Журнал', href: '/admin/audit' });
  if (user.permissions.includes('backup.manage')) items.push({ label: 'Резервные копии', href: '/admin/backups' });
  if (user.permissions.includes('eod.run')) items.push({ label: 'Опердень', href: '/admin/eod' });
  return items;
}
