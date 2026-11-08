// Маршруты модуля: вклады: каталог и калькулятор открыты гостю. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/deposits', load: () => import('./pages/deposits.js'), access: 'public' },
  { path: '/deposits/new', load: () => import('./pages/deposit-new.js'), access: 'client' },
  { path: '/deposits/:id', load: () => import('./pages/deposit.js'), access: 'client' },
  { path: '/deposits/:id/close', load: () => import('./pages/deposit-close.js'), access: 'client' }
];
