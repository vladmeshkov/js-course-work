import * as staffDashboardService from '../services/staffDashboardService.js';
import * as dashboardService from '../services/dashboardService.js';
import { ForbiddenError } from '../lib/errors.js';

export async function cabinet(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  res.render('pages/cabinet/index', { title: 'Главная', ...(await dashboardService.forClient(req.user.id)) });
}

export async function workplace(req, res) {
  res.render('pages/cabinet/workplace', { title: 'Рабочее место', ...(await staffDashboardService.forUser(req.user)) });
}
