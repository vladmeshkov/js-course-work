// Маршруты модуля: платежи. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/payments', load: () => import('./pages/payments.js'), access: 'client' },
  { path: '/payments/catalog', load: () => import('./pages/payments-catalog.js'), access: 'client' },
  { path: '/payments/catalog/:id', load: () => import('./pages/payments-category.js'), access: 'client' },
  { path: '/payments/pay/:providerId', load: () => import('./pages/payment-pay.js'), access: 'client' },
  { path: '/payments/:id/receipt', load: () => import('./pages/payment-receipt.js'), access: 'client' }
];
