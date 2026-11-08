// Маршруты модуля: курсы валют. access: 'public' (по умолчанию), 'auth', 'client', 'staff' или { permission }.
// Статичные пути раньше путей с «:id».
export default [
  { path: '/rates', load: () => import('./pages/rates.js') }
];
