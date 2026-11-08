// Маршруты модуля: главная, информационные страницы, кабинеты. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/', load: () => import('./pages/home.js') },
  { path: '/forgot', load: () => import('./pages/info.js') },
  { path: '/info/:slug', load: () => import('./pages/info.js') },
  { path: '/cabinet', load: () => import('./pages/cabinet.js'), access: 'client' },
  { path: '/workplace', load: () => import('./pages/workplace.js'), access: 'staff' }
];
