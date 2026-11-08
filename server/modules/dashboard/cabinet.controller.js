import * as staffDashboardService from './staff-dashboard.service.js';
import * as dashboardService from './dashboard.service.js';

/** Главная клиента: суммы по счетам, плитки продуктов, последние операции. */
export async function cabinet(req, res) {
  res.json(await dashboardService.forClient(req.user.id));
}

/** Рабочее место сотрудника: показатели и ближайшие задачи по правам роли. */
export async function workplace(req, res) {
  res.json(await staffDashboardService.forUser(req.user));
}
