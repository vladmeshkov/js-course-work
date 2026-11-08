// Маршруты модуля «Вклады и кредиты»: каталог и калькуляторы открыты гостю, остальное клиенту,
// заявки на кредит рассматривает сотрудник с правом loan.review. Статичные пути раньше «:id».
export default [
  { path: '/deposits', load: () => import('../pages/deposits.js'), access: 'public' },
  { path: '/deposits/new', load: () => import('../pages/deposit-new.js'), access: 'client' },
  { path: '/deposits/:id', load: () => import('../pages/deposit.js'), access: 'client' },
  { path: '/deposits/:id/close', load: () => import('../pages/deposit-close.js'), access: 'client' },
  { path: '/loans', load: () => import('../pages/loans.js'), access: 'public' },
  { path: '/loans/new', load: () => import('../pages/loan-new.js'), access: 'client' },
  { path: '/loans/applications/:id', load: () => import('../pages/loan-application.js'), access: 'client' },
  { path: '/loans/:id', load: () => import('../pages/loan.js'), access: 'client' },
  { path: '/staff/loans', load: () => import('../pages/staff-loans.js'), access: { permission: 'loan.review' } },
  { path: '/staff/loans/:id', load: () => import('../pages/staff-loan-review.js'), access: { permission: 'loan.review' } }
];
