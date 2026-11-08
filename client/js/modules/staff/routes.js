// Маршруты модуля: рабочее место операциониста. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/staff/kyc', load: () => import('./pages/staff-kyc.js'), access: { permission: 'kyc.review' } },
  { path: '/staff/kyc/:id', load: () => import('./pages/staff-kyc-review.js'), access: { permission: 'kyc.review' } },
  { path: '/staff/cash', load: () => import('./pages/staff-cash.js'), access: { permission: 'cash.operate' } },
  { path: '/staff/incoming', load: () => import('./pages/staff-incoming.js'), access: { permission: 'cash.operate' } },
  { path: '/staff/accounts', load: () => import('./pages/staff-accounts.js'), access: { permission: 'account.freeze' } }
];
