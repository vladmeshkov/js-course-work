// Маршруты счетов и карт (клиент банка). Статичные пути раньше «:id».
export default [
  { path: '/accounts', load: () => import('../pages/accounts.js'), access: 'client' },
  { path: '/accounts/new', load: () => import('../pages/account-new.js'), access: 'client' },
  { path: '/accounts/:id', load: () => import('../pages/account.js'), access: 'client' },
  { path: '/accounts/:id/statement', load: () => import('../pages/account-statement.js'), access: 'client' },
  { path: '/cards', load: () => import('../pages/cards.js'), access: 'client' },
  { path: '/cards/new', load: () => import('../pages/card-new.js'), access: 'client' },
  { path: '/cards/:id', load: () => import('../pages/card.js'), access: 'client' }
];
