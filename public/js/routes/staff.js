// Маршруты модуля (путь в браузере, загрузка страницы, доступ).
export default [
  // рабочее место операциониста и специалиста по мониторингу
  { path: '/staff/kyc', load: () => import('../pages/staff-kyc.js'), access: { permission: 'kyc.review' } },
  { path: '/staff/kyc/:id', load: () => import('../pages/staff-kyc-review.js'), access: { permission: 'kyc.review' } },
  { path: '/staff/cash', load: () => import('../pages/staff-cash.js'), access: { permission: 'cash.operate' } },
  { path: '/staff/incoming', load: () => import('../pages/staff-incoming.js'), access: { permission: 'cash.operate' } },
  { path: '/staff/accounts', load: () => import('../pages/staff-accounts.js'), access: { permission: 'account.freeze' } },
  { path: '/staff/fraud', load: () => import('../pages/staff-fraud.js'), access: { permission: 'fraud.review' } },
  { path: '/staff/fraud/:id', load: () => import('../pages/staff-fraud-case.js'), access: { permission: 'fraud.review' } }
];

