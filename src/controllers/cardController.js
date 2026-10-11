import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import * as accountService from '../services/accountService.js';
import * as cardService from '../services/cardService.js';
import * as clientModel from '../models/clientModel.js';

function requireClient(req) {
  if (req.user?.role_code !== 'client') throw new ForbiddenError();
}

export async function index(req, res) {
  requireClient(req);
  res.render('pages/cards/index', { title: 'Карты', cards: await cardService.listForClient(req.user.id), systems: cardService.SYSTEMS });
}

async function renderNew(req, res, { form = {}, errors = {}, status = 200 } = {}) {
  requireClient(req);
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => ['current', 'savings'].includes(a.kind));
  res.status(status).render('pages/cards/new', { title: 'Выпустить карту', accounts, systems: cardService.SYSTEMS, form, errors });
}

export const showNew = (req, res) => renderNew(req, res);

export async function create(req, res) {
  try {
    const card = await cardService.issueCard(req.user.id, {
      accountId: Number(req.body.accountId), system: req.body.system, pin: req.body.pin
    });
    req.session.cardSecret = { id: card.id, number: card.number, cvv: card.cvv };
    res.redirect(`/cards/${card.id}`);
  } catch (error) {
    if (error instanceof ValidationError) return renderNew(req, res, { form: { ...req.body, pin: '' }, errors: error.fields, status: 422 });
    if (error instanceof AppError && error.status < 500) return renderNew(req, res, { form: { ...req.body, pin: '' }, errors: { common: error.message }, status: error.status });
    throw error;
  }
}

async function renderShow(req, res, extra = {}) {
  requireClient(req);
  const id = Number(req.params.id);
  const data = await cardService.getForClient(req.user.id, id);
  // номер и CVV показываются один раз сразу после выпуска
  const secret = req.session.cardSecret?.id === id ? req.session.cardSecret : null;
  if (secret) delete req.session.cardSecret;
  res.status(extra.status ?? 200).render('pages/cards/show', {
    title: `Карта *${data.card.last4}`, ...data, systems: cardService.SYSTEMS, secret,
    errors: extra.errors ?? {}, form: extra.form ?? {}, purchaseError: extra.purchaseError ?? null
  });
}

export const show = (req, res) => renderShow(req, res);

export async function block(req, res) {
  requireClient(req);
  await cardService.setBlocked(req.user.id, Number(req.params.id), req.body.action !== 'unblock');
  req.flash('success', req.body.action === 'unblock' ? 'Карта разблокирована' : 'Карта заблокирована');
  res.redirect(`/cards/${req.params.id}`);
}

export async function close(req, res) {
  requireClient(req);
  await cardService.closeCard(req.user.id, Number(req.params.id));
  req.flash('success', 'Карта закрыта');
  res.redirect('/cards');
}

export async function limits(req, res) {
  requireClient(req);
  const b = req.body;
  try {
    const parsed = { perOp: parseAmount(b.perOp), daily: parseAmount(b.daily), monthly: parseAmount(b.monthly), online: b.online === 'on' };
    await cardService.updateLimits(req.user.id, Number(req.params.id), parsed);
    req.flash('success', 'Лимиты сохранены');
    res.redirect(`/cards/${req.params.id}`);
  } catch (error) {
    if (error instanceof ValidationError) return renderShow(req, res, { status: 422, errors: error.fields, form: b });
    throw error;
  }
}

export async function purchase(req, res) {
  requireClient(req);
  try {
    const amount = parseAmount(req.body.amount);
    await cardService.purchase(req.user.id, Number(req.params.id), { amount, online: req.body.online === 'on', place: req.body.place });
    req.flash('success', 'Операция выполнена');
    res.redirect(`/cards/${req.params.id}`);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return renderShow(req, res, { status: error.status, purchaseError: error.message, form: req.body });
    throw error;
  }
}
