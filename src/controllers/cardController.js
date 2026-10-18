import { parseAmount } from '../lib/money.js';
import * as accountService from '../services/accountService.js';
import * as cardService from '../services/cardService.js';
import * as clientModel from '../models/clientModel.js';

/** Карты клиента и названия платёжных систем. Если карта одна или больше, клиент открывает первую. */
export async function index(req, res) {
  res.json({ cards: await cardService.listForClient(req.user.id), systems: cardService.SYSTEMS });
}

/** Данные формы выпуска: счета, к которым можно привязать карту, и платёжные системы. */
export async function showNew(req, res) {
  const client = await clientModel.findByUserId(req.user.id);
  const accounts = (await accountService.listForClient(client.id)).filter((a) => ['current', 'savings'].includes(a.kind));
  res.json({ accounts, systems: cardService.SYSTEMS });
}

/** Выпуск карты. Номер и CVV запоминаются в сессии и показываются один раз на странице карты. */
export async function create(req, res) {
  const card = await cardService.issueCard(req.user.id, {
    accountId: Number(req.body.accountId), system: req.body.system, pin: req.body.pin
  });
  req.session.cardSecret = { id: card.id, number: card.number, cvv: card.cvv };
  res.status(201).json({ id: card.id });
}

/** Карта, её операции, остальные карты клиента и (однократно после выпуска) номер с CVV. */
export async function show(req, res) {
  const id = Number(req.params.id);
  const data = await cardService.getForClient(req.user.id, id);
  const secret = req.session.cardSecret?.id === id ? req.session.cardSecret : null;
  if (secret) delete req.session.cardSecret;
  res.json({ ...data, systems: cardService.SYSTEMS, secret, cards: await cardService.listForClient(req.user.id) });
}

export async function block(req, res) {
  const unblock = req.body.action === 'unblock';
  await cardService.setBlocked(req.user.id, Number(req.params.id), !unblock);
  res.json({ message: unblock ? 'Карта разблокирована' : 'Карта заблокирована' });
}

export async function close(req, res) {
  await cardService.closeCard(req.user.id, Number(req.params.id));
  res.json({ message: 'Карта закрыта' });
}

export async function limits(req, res) {
  const b = req.body;
  const parsed = { perOp: parseAmount(b.perOp), daily: parseAmount(b.daily), monthly: parseAmount(b.monthly), online: b.online === 'on' || b.online === true };
  await cardService.updateLimits(req.user.id, Number(req.params.id), parsed);
  res.json({ message: 'Лимиты сохранены' });
}

export async function purchase(req, res) {
  const amount = parseAmount(req.body.amount);
  await cardService.purchase(req.user.id, Number(req.params.id), { amount, online: req.body.online === 'on' || req.body.online === true, place: req.body.place });
  res.json({ message: 'Операция выполнена' });
}
