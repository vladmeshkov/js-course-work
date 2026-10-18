import * as staffDashboardService from '../services/staffDashboardService.js';
import * as dashboardService from '../services/dashboardService.js';

/** Главная клиента: суммы по счетам, плитки продуктов, последние операции. */
export async function cabinet(req, res) {
  res.json(await dashboardService.forClient(req.user.id));
}

/** Рабочее место сотрудника: показатели и ближайшие задачи по правам роли. */
export async function workplace(req, res) {
  res.json(await staffDashboardService.forUser(req.user));
}
