// Маршруты модуля: переводы. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/transfers/new', load: () => import('./pages/transfer-new.js'), access: 'client' },
  { path: '/transfers/interbank', load: () => import('./pages/transfer-interbank.js'), access: 'client' },
  { path: '/transfers/interbank/:id/confirm', load: () => import('./pages/transfer-interbank-confirm.js'), access: 'client' },
  { path: '/transfers/:id/confirm', load: () => import('./pages/transfer-confirm.js'), access: 'client' }
];
