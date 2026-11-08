// Маршруты модуля: антифрод. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/staff/fraud', load: () => import('./pages/staff-fraud.js'), access: { permission: 'fraud.review' } },
  { path: '/staff/fraud/:id', load: () => import('./pages/staff-fraud-case.js'), access: { permission: 'fraud.review' } }
];
