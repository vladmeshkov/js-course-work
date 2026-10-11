import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
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

export function showNew(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  res.render('pages/accounts/new', { title: 'Открыть счёт', form: {}, errors: {} });
}

export async function create(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  try {
    const account = await accountService.openForUser(req.user.id, { kind: req.body.kind, currency: req.body.currency });
    req.flash('success', 'Счёт открыт');
    res.redirect(`/accounts/${account.id}`);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(422).render('pages/accounts/new', { title: 'Открыть счёт', form: req.body, errors: error.fields });
    if (error instanceof AppError && error.status < 500) return res.status(error.status).render('pages/accounts/new', { title: 'Открыть счёт', form: req.body, errors: { common: error.message } });
    throw error;
  }
}

export async function close(req, res) {
  if (req.user.role_code !== 'client') throw new ForbiddenError();
  try {
    await accountService.closeForUser(req.user.id, Number(req.params.id));
    req.flash('success', 'Счёт закрыт');
    res.redirect('/accounts');
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      req.flash('error', error.message);
      return res.redirect(`/accounts/${req.params.id}`);
    }
    throw error;
  }
}
