import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import * as accountModel from '../models/accountModel.js';
import * as clientModel from '../models/clientModel.js';
import * as accountService from '../services/accountService.js';

/** Анкета клиента текущего пользователя (маршруты уже проверили роль через requireClient). */
async function currentClient(req) {
  const client = await clientModel.findByUserId(req.user.id);
  if (!client) throw new ForbiddenError();
  return client;
}

/** Список счетов клиента. */
export async function list(req, res) {
  const client = await currentClient(req);
  res.json({ accounts: await accountService.listForClient(client.id) });
}

/** Счёт и последние операции по нему. */
export async function show(req, res) {
  const client = await currentClient(req);
  const account = await accountModel.findById(Number(req.params.id));
  if (!account || account.owner_client_id !== client.id) throw new NotFoundError();
  res.json({ account, operations: await accountModel.operations(account.id) });
}

/** Открытие счёта: возвращает номер нового счёта, переход на его страницу делает клиент. */
export async function create(req, res) {
  const account = await accountService.openForUser(req.user.id, { kind: req.body.kind, currency: req.body.currency });
  res.status(201).json({ id: account.id, message: 'Счёт открыт' });
}

/** Закрытие счёта с нулевым остатком. */
export async function close(req, res) {
  await accountService.closeForUser(req.user.id, Number(req.params.id));
  res.json({ message: 'Счёт закрыт' });
}
