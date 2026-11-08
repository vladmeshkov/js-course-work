// Маршруты модуля: уведомления. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/notifications', load: () => import('./pages/notifications.js'), access: 'auth' }
];
