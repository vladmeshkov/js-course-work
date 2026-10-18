import { formatAmount } from '../lib/money.js';
import { formatIban } from '../lib/iban.js';
import { createDocument, fact, table, footer } from '../lib/pdf.js';
import * as statementService from '../services/statementService.js';
import * as paymentService from '../services/paymentService.js';
import * as accountService from '../services/accountService.js';

const fullName = (c) => [c.last_name, c.first_name, c.patronymic].filter(Boolean).join(' ');
const money = (minor, currency) => `${formatAmount(minor)} ${currency}`;

/** Выписка за период в JSON: сама выписка и все счета клиента (для переключения между ними). Отбор по виду операций делает клиент. */
export async function statement(req, res) {
  const { client, ...data } = await statementService.getStatement(req.user.id, Number(req.params.id), { from: req.query.from, to: req.query.to });
  res.json({ statement: data, accounts: await accountService.listForClient(client.id) });
}

export async function statementPdf(req, res) {
  const s = await statementService.getStatement(req.user.id, Number(req.params.id), { from: req.query.from, to: req.query.to });
  const cur = s.account.currency;
  const doc = createDocument('Выписка по счёту', `за период с ${s.from} по ${s.to}`);
  fact(doc, 'Владелец', fullName(s.client));
  fact(doc, 'Номер счёта', formatIban(s.account.iban));
  fact(doc, 'Валюта', cur);
  fact(doc, 'Входящий остаток', money(s.opening, cur));
  fact(doc, 'Поступления', money(s.credit, cur));
  fact(doc, 'Списания', money(s.debit, cur));
  fact(doc, 'Исходящий остаток', money(s.closing, cur));
  doc.moveDown(0.8);
  table(doc, [
    { title: 'Дата', width: 62 }, { title: 'Операция', width: 223 }, { title: 'Сумма', width: 105, align: 'right' }, { title: 'Остаток', width: 105, align: 'right' }
  ], s.operations.map((o) => [o.date, o.description, formatAmount(o.amount), formatAmount(o.balance)]));
  if (!s.operations.length) doc.moveDown(0.5).font('regular').fontSize(10).text('За выбранный период операций не было.');
  footer(doc, `Документ сформирован автоматически на банковскую дату ${s.today}. Получатель: ${fullName(s.client)}.`);
  res.type('application/pdf').set('Content-Disposition', `inline; filename="vypiska-${s.to}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function certificatePdf(req, res) {
  const c = await statementService.getCertificate(req.user.id, Number(req.params.id));
  const cur = c.account.currency;
  const doc = createDocument('Справка об остатке на счёте', `по состоянию на ${c.date}`);
  doc.font('regular').fontSize(11).text(`Настоящая справка выдана ${fullName(c.client)} в том, что на счёте ${formatIban(c.account.iban)} по состоянию на ${c.date} находятся денежные средства.`);
  doc.moveDown(0.8);
  fact(doc, 'Остаток на счёте', money(c.balance, cur));
  fact(doc, 'Из них зарезервировано', money(c.held, cur));
  fact(doc, 'Доступно', money(c.balance - c.held, cur));
  footer(doc, 'Справка сформирована автоматически и действительна на указанную дату.');
  res.type('application/pdf').set('Content-Disposition', `inline; filename="spravka-${c.date}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function receiptPdf(req, res) {
  const r = await paymentService.getReceipt(req.user.id, Number(req.params.id));
  const doc = createDocument(`Квитанция об оплате № ${r.id}`, `от ${String(r.bank_date).slice(0, 10)}`);
  fact(doc, 'Получатель', r.provider_name);
  fact(doc, 'Категория', r.category_name);
  fact(doc, r.requisite_label ?? 'Реквизит', r.requisite);
  fact(doc, 'Со счёта', formatIban(r.iban));
  fact(doc, 'Сумма', money(r.amount, 'BYN'));
  fact(doc, 'Комиссия', money(r.fee, 'BYN'));
  fact(doc, 'Списано', money(r.amount + r.fee, 'BYN'));
  footer(doc, 'Платёж проведён в системе ТалерБанк.');
  res.type('application/pdf').set('Content-Disposition', `inline; filename="kvitanciya-${r.id}.pdf"`);
  doc.pipe(res);
  doc.end();
}
