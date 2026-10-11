import * as clientModel from '../models/clientModel.js';
import * as accountService from '../services/accountService.js';
import { ForbiddenError } from '../lib/errors.js';

export async function cabinet(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = client ? await accountService.listForClient(client.id) : [];
  res.render('pages/cabinet/index', { title: 'Главная', client, accounts });
}

export function workplace(req, res) {
  res.render('pages/cabinet/workplace', { title: 'Рабочее место' });
}
