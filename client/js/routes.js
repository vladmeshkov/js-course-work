// Маршруты всех модулей. Порядок важен: первым совпавшим считается самый ранний маршрут.
import dashboard from './modules/dashboard/routes.js';
import auth from './modules/auth/routes.js';
import rates from './modules/rates/routes.js';
import notifications from './modules/notifications/routes.js';
import accounts from './modules/accounts/routes.js';
import cards from './modules/cards/routes.js';
import payments from './modules/payments/routes.js';
import transfers from './modules/transfers/routes.js';
import deposits from './modules/deposits/routes.js';
import loans from './modules/loans/routes.js';
import staff from './modules/staff/routes.js';
import fraud from './modules/fraud/routes.js';
import admin from './modules/admin/routes.js';

export default [
  ...dashboard,
  ...auth,
  ...rates,
  ...notifications,
  ...accounts,
  ...cards,
  ...payments,
  ...transfers,
  ...deposits,
  ...loans,
  ...staff,
  ...fraud,
  ...admin
];
