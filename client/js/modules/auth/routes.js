// Маршруты модуля: вход, регистрация, безопасность. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/login', load: () => import('./pages/login.js') },
  { path: '/login/2fa', load: () => import('./pages/login-2fa.js') },
  { path: '/welcome', load: () => import('./pages/welcome.js'), access: 'auth' },
  { path: '/register', load: () => import('./pages/register.js') },
  { path: '/security', load: () => import('./pages/security.js'), access: 'auth' },
  { path: '/security/2fa/setup', load: () => import('./pages/security-setup.js'), access: 'auth' }
];
