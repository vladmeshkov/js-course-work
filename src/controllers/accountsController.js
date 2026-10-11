import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from '../services/accountService.js';

async function currentClient(req) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  const client = await clientModel.findByUserId(req.user.id);
  if (!client) throw new ForbiddenError();
  return client;
}

export async function list(req, res) {
  const client = await currentClient(req);
  const accounts = await accountService.listForClient(client.id);
  res.render('pages/accounts/index', { title: 'Счета и карты', accounts });
}

export async function show(req, res) {
  const client = await currentClient(req);
  const account = await accountModel.findById(Number(req.params.id));
  if (!account || account.owner_client_id !== client.id) throw new NotFoundError();
  const operations = await accountModel.operations(account.id);
  res.render('pages/accounts/show', { title: account.title, account, operations });
}
