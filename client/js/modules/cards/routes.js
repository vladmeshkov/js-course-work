// Маршруты модуля: карты. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/cards', load: () => import('./pages/cards.js'), access: 'client' },
  { path: '/cards/new', load: () => import('./pages/card-new.js'), access: 'client' },
  { path: '/cards/:id', load: () => import('./pages/card.js'), access: 'client' }
];
