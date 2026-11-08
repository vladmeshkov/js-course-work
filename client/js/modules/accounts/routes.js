// Маршруты модуля: счета. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/accounts', load: () => import('./pages/accounts.js'), access: 'client' },
  { path: '/accounts/new', load: () => import('./pages/account-new.js'), access: 'client' },
  { path: '/accounts/:id', load: () => import('./pages/account.js'), access: 'client' },
  { path: '/accounts/:id/statement', load: () => import('./pages/account-statement.js'), access: 'client' }
];
