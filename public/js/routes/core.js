// Маршруты ядра: главная, вход и регистрация, курсы, безопасность, уведомления, кабинеты.
// access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission: 'код права' }.
export default [
  { path: '/', load: () => import('../pages/home.js') },
  { path: '/login', load: () => import('../pages/login.js') },
  { path: '/login/2fa', load: () => import('../pages/login-2fa.js') },
  { path: '/welcome', load: () => import('../pages/welcome.js'), access: 'auth' },
  { path: '/register', load: () => import('../pages/register.js') },
  { path: '/forgot', load: () => import('../pages/info.js') },
  { path: '/info/:slug', load: () => import('../pages/info.js') },
  { path: '/rates', load: () => import('../pages/rates.js') },
  { path: '/security', load: () => import('../pages/security.js'), access: 'auth' },
  { path: '/security/2fa/setup', load: () => import('../pages/security-setup.js'), access: 'auth' },
  { path: '/notifications', load: () => import('../pages/notifications.js'), access: 'auth' },
  { path: '/cabinet', load: () => import('../pages/cabinet.js'), access: 'client' },
  { path: '/workplace', load: () => import('../pages/workplace.js'), access: 'staff' }
];
