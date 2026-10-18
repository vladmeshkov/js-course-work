// Маршруты модуля «Платежи и переводы» (путь в браузере, загрузка страницы, доступ). Статичные пути раньше «:id».
export default [
  { path: '/payments', load: () => import('../pages/payments.js'), access: 'client' },
  { path: '/payments/catalog', load: () => import('../pages/payments-catalog.js'), access: 'client' },
  { path: '/payments/catalog/:id', load: () => import('../pages/payments-category.js'), access: 'client' },
  { path: '/payments/pay/:providerId', load: () => import('../pages/payment-pay.js'), access: 'client' },
  { path: '/payments/:id/receipt', load: () => import('../pages/payment-receipt.js'), access: 'client' },
  { path: '/transfers/new', load: () => import('../pages/transfer-new.js'), access: 'client' },
  { path: '/transfers/interbank', load: () => import('../pages/transfer-interbank.js'), access: 'client' },
  { path: '/transfers/interbank/:id/confirm', load: () => import('../pages/transfer-interbank-confirm.js'), access: 'client' },
  { path: '/transfers/:id/confirm', load: () => import('../pages/transfer-confirm.js'), access: 'client' }
];
