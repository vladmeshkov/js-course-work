// Маршруты модуля: кредиты и заявки у кредитного специалиста. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/loans', load: () => import('./pages/loans.js'), access: 'public' },
  { path: '/loans/new', load: () => import('./pages/loan-new.js'), access: 'client' },
  { path: '/loans/applications/:id', load: () => import('./pages/loan-application.js'), access: 'client' },
  { path: '/loans/:id', load: () => import('./pages/loan.js'), access: 'client' },
  { path: '/staff/loans', load: () => import('./pages/staff-loans.js'), access: { permission: 'loan.review' } },
  { path: '/staff/loans/:id', load: () => import('./pages/staff-loan-review.js'), access: { permission: 'loan.review' } }
];
