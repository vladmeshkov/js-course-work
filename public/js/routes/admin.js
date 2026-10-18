// Маршруты модуля «Администрирование» (путь в браузере, загрузка страницы, доступ по праву).
export default [
  { path: '/admin/rates', load: () => import('../pages/admin-rates.js'), access: { permission: 'rates.manage' } },
  { path: '/admin/users', load: () => import('../pages/admin-users.js'), access: { permission: 'users.manage' } },
  { path: '/admin/audit', load: () => import('../pages/admin-audit.js'), access: { permission: 'audit.view' } },
  { path: '/admin/backups', load: () => import('../pages/admin-backups.js'), access: { permission: 'backup.manage' } },
  { path: '/admin/reports', load: () => import('../pages/admin-reports.js'), access: { permission: 'reports.view' } },
  { path: '/admin/clearing', load: () => import('../pages/admin-clearing.js'), access: { permission: 'eod.run' } },
  { path: '/admin/eod', load: () => import('../pages/admin-eod.js'), access: { permission: 'eod.run' } }
];
