// Диаграммы классов UML для записки: модель предметной области и слой бизнес-логики.
// Использование: npm run uml:classes. Результат: docs/diagrams/class-diagrams.drawio и SVG-рисунки рядом.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassDiagram, top, bottom, left, right } from './lib/uml.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/diagrams');
mkdirSync(outDir, { recursive: true });

/** Кратность у конца связи: подпись рядом с точкой p, сегмент идёт к точке q. */
function mult(p, q, text, off = 0) {
  const vertical = Math.abs(q[1] - p[1]) >= Math.abs(q[0] - p[0]);
  if (vertical) return { text, x: p[0] + (off ? 14 : 8), y: p[1] + (q[1] > p[1] ? 18 + off : -8 - off) };
  return { text, x: p[0] + (q[0] > p[0] ? 6 + off : -6 - off), y: p[1] - 7, anchor: q[0] > p[0] ? 'start' : 'end' };
}
/** Горизонтальная связь между соседями по ряду: обе точки на одной высоте, a левее b. */
const hline = (a, b, dy = 48) => { const y = Math.max(a.y, b.y) + dy; return [[a.x + a.w, y], [b.x, y]]; };
function link(d, kind, pts, m1, m2, extra = {}) {
  const marks = [];
  if (m1) marks.push(mult(pts[0], pts[1], m1, kind === 'aggregation' || kind === 'composition' ? 24 : 0));
  if (m2) marks.push(mult(pts[pts.length - 1], pts[pts.length - 2], m2));
  d.addEdge({ kind, points: pts, marks, arrow: extra.arrow, label: extra.label, labelSeg: extra.seg, labelY: extra.labelY });
}

/** Раскладка по сетке: ряды выравниваются по верху, шаг по горизонтали задан. */
function grid(boxes, rows, { pitch = 430, gap = 130, x0 = 50, y0 = 50 } = {}) {
  let y = y0;
  rows.forEach((row) => {
    let h = 0;
    row.forEach((name, c) => {
      if (!name) return;
      const b = boxes[name];
      b.x = x0 + c * pitch; b.y = y; h = Math.max(h, b.h);
    });
    y += h + gap;
  });
}

/* =====================  1. Модель предметной области (4 рисунка)  ===================== */
// Атрибуты соответствуют столбцам таблиц БД (db/sql), операции: функциям сервисов src/services.
const DW = 300;                       // ширина класса в диаграммах предметной области
const spec = {
  Role: { name: 'Role', fields: ['- id: number', '- code: string', '- name: string', '- permissions: string[]'], methods: [] },
  User: { name: 'User', fields: ['- id: number', '- login: string', '- passwordHash: string', '- status: string', '- failedAttempts: number', '- totpEnabled: boolean'], methods: ['+ login(password): Session', '+ setBlocked(blocked): void', '+ changeRole(role): void'] },
  Client: { name: 'Client', fields: ['- id: number', '- lastName: string', '- firstName: string', '- patronymic: string', '- birthDate: Date', '- kycStatus: string'], methods: ['+ verifyClient(): void', '+ rejectClient(comment): void'] },
  Account: { name: 'Account', fields: ['- id: number', '- iban: string', '- kind: string', '- currency: string', '- balance: number', '- status: string'], methods: ['+ openForUser(): void', '+ closeForUser(): void', '+ setFrozen(frozen): void'] },
  Card: { name: 'Card', fields: ['- id: number', '- system: string', '- numberEnc: string', '- last4: string', '- dailyLimit: number', '- onlineEnabled: boolean', '- status: string'], methods: ['+ setBlocked(blocked): void', '+ updateLimits(limits): void', '+ purchase(amount): void'] },
  Payment: { name: 'Payment', fields: ['- id: number', '- requisite: string', '- amount: number', '- fee: number', '- source: string'], methods: ['+ pay(): void', '+ getReceipt(): Receipt'] },
  TransferIntent: { name: 'TransferIntent', fields: ['- id: string', '- kind: string', '- amount: number', '- amountByn: number', '- fee: number', '- status: string', '- expiresAt: Date'], methods: ['+ confirmTransfer(code): void', '+ cancelTransfer(): void'] },
  Document: { name: 'Document', fields: ['- id: number', '- type: string', '- status: string', '- idempotencyKey: string', '- bankDate: Date'], methods: ['+ post(entries): void', '+ reverse(): void'] },
  Posting: { name: 'Posting', fields: ['- id: number', '- debitAccount: Account', '- creditAccount: Account', '- amount: number', '- bankDate: Date'], methods: [] },
  Deposit: { name: 'Deposit', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- openedDate: Date', '- maturityDate: Date', '- interestTotal: number', '- status: string'], methods: ['+ quoteEarlyClose(): number', '+ closeEarly(): void'] },
  DepositProduct: { name: 'DepositProduct', fields: ['- id: number', '- name: string', '- currency: string', '- termMonths: number', '- ratePercent: number', '- capitalization: boolean', '- revocable: boolean'], methods: ['+ projectIncome(amount): number'] },
  LoanProduct: { name: 'LoanProduct', fields: ['- id: number', '- name: string', '- ratePercent: number', '- minAmount: number', '- maxAmount: number', '- minTerm: number', '- maxTerm: number'], methods: ['+ previewSchedule(): Installment[]'] },
  LoanApplication: { name: 'LoanApplication', fields: ['- id: number', '- amount: number', '- termMonths: number', '- scheduleType: ScheduleType', '- dtiPercent: number', '- score: number', '- pdPercent: number', '- status: string'], methods: ['+ apply(): void', '+ decide(approve): void', '+ sign(code): Loan'] },
  Loan: { name: 'Loan', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- termMonths: number', '- principalBalance: number', '- status: string'], methods: ['+ quoteFull(): number', '+ repayPartial(amount): void', '+ repayFull(): void'] },
  ScheduleType: { name: 'ScheduleType', stereotype: 'enumeration', fields: ['annuity', 'differentiated'], methods: null }
};
function domainPage(name, names, collapsed, rows, opt = {}) {
  const d = new ClassDiagram(name, { width: 900, height: 1200 });
  const B = {};
  for (const n of names) B[n] = d.addClass({ w: n === 'ScheduleType' ? 210 : DW, ...spec[n] });
  for (const n of collapsed) B[n] = d.addClass({ name: n, fields: null, methods: null, w: DW });
  grid(B, rows, { pitch: DW + (opt.gapX ?? 140), gap: opt.gapY ?? 130, x0: opt.x0 ?? 70, y0: 50 });
  return { d, B, L: (kind, pts, a, b, extra) => link(d, kind, pts, a, b, extra) };
}

function domain1() {
  const { d, B, L } = domainPage('Пользователи, клиенты и счета', ['Role', 'User', 'Client', 'Account'], [], [['Role', 'User'], ['Account', 'Client']]);
  L('association', hline(B.Role, B.User), '1', '0..*', { label: 'присвоена' });
  L('association', [bottom(B.User), top(B.Client)], '1', '0..1', { label: 'соответствует' });
  const y = B.Client.y + 48;
  L('aggregation', [[B.Client.x, y], [B.Account.x + B.Account.w, y]], '1', '0..*', { label: 'владеет' });
  return d;
}

function domain2() {
  const { d, B, L } = domainPage('Счета, платежи, переводы и проводки', ['Account', 'Card', 'Payment', 'TransferIntent', 'Posting', 'Document'], [], [['Account', 'Card'], ['Payment', 'TransferIntent'], ['Posting', 'Document']], { x0: 90, gapY: 120 });
  L('association', hline(B.Account, B.Card), '1', '0..*', { label: 'обслуживает' });
  L('association', [bottom(B.Account, 0.4), top(B.Payment, 0.4)], '1', '0..*', { label: 'оплачивает' });
  { const p = bottom(B.Account, 0.88), q = top(B.TransferIntent, 0.3), y = Math.max(B.Account.y + B.Account.h, B.Card.y + B.Card.h) + 42; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'отправляет', seg: 1 }); }
  { const p = left(B.Account, 0.9), q = left(B.Posting, 0.5), x = B.Account.x - 50; L('association', [p, [x, p[1]], [x, q[1]], q], '1', '0..*', { label: 'участвует в', seg: 1, labelY: B.Posting.y - 40 }); }
  L('composition', hline(B.Posting, B.Document).reverse(), '1', '1..*', { label: 'содержит' });
  { const p = top(B.Document, 0.2), q = bottom(B.Payment, 0.5), y = B.Document.y - 45; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'оформляет', seg: 1 }); }
  L('association', [top(B.Document, 0.75), bottom(B.TransferIntent, 0.75)], '1', '0..*', { label: 'оформляет' });
  return d;
}

function domain3() {
  const { d, B, L } = domainPage('Вклады', ['Client', 'Account', 'Deposit', 'DepositProduct'], [], [['Client', 'Account'], ['Deposit', null], ['DepositProduct', null]], { gapY: 130 });
  L('aggregation', [bottom(B.Client), top(B.Deposit)], '1', '0..*', { label: 'открывает' });
  { const p = bottom(B.Account), q = right(B.Deposit, 0.3); L('association', [p, [p[0], q[1]], q], '1', '0..*', { label: 'хранит', seg: 1 }); }
  L('association', [bottom(B.Deposit), top(B.DepositProduct)], '0..*', '1', { label: 'открыт по' });
  return d;
}

function domain4() {
  const { d, B, L } = domainPage('Кредиты', ['Client', 'LoanProduct', 'LoanApplication', 'Account', 'Loan', 'ScheduleType'], [], [['Client', 'LoanProduct'], ['LoanApplication', null], ['Account', 'Loan'], [null, 'ScheduleType']], { gapY: 110 });
  const x0 = B.Client.x, pitch = B.LoanProduct.x - B.Client.x;
  B.LoanApplication.x = x0 + pitch / 2;
  B.ScheduleType.x = B.Loan.x + DW - B.ScheduleType.w;
  const xc = x0 + pitch / 2 + 40, xl = B.LoanProduct.x + 40;       // вертикали в зонах перекрытия по оси x
  L('aggregation', [[xc, B.Client.y + B.Client.h], [xc, B.LoanApplication.y]], '1', '0..*', { label: 'подаёт' });
  L('association', [[xl, B.LoanProduct.y + B.LoanProduct.h], [xl, B.LoanApplication.y]].reverse().reverse(), '1', '0..*', { label: 'оформляется по' });
  L('association', [[xl, B.LoanApplication.y + B.LoanApplication.h], [xl, B.Loan.y]], '1', '0..1', { label: 'порождает' });
  L('association', [[B.ScheduleType.x + 50, B.Loan.y + B.Loan.h], [B.ScheduleType.x + 50, B.ScheduleType.y]], '', '', { arrow: true, label: 'использует' });
  { const y = B.Loan.y + 48; L('association', [[B.Account.x + B.Account.w, y], [B.Loan.x, y]], '1', '0..*', { label: 'погашает' }); }
  return d;
}

/* =====================  2. Слой бизнес-логики (4 рисунка)  ===================== */
// Методы берутся из реальных export в src/services; стрелки соответствуют импортам между сервисами.
const SW = 235;
function svcPage(name) {
  const d = new ClassDiagram(name, { width: 900, height: 1200 });
  const exportsOf = (file, names) => {
    const text = readFileSync(path.join(root, 'src/services', `${file}.js`), 'utf8');
    return names.filter((n) => new RegExp(`export (?:async )?function ${n}\\b|export const ${n}\\b`).test(text)).map((n) => `+ ${n}()`);
  };
  const defs = {
    EodService: ['eodService', ['closeDay', 'advanceDays', 'currentBankDate']],
    DepositService: ['depositService', ['openDeposit', 'closeEarly', 'processDeposits', 'projectIncome']],
    PaymentService: ['paymentService', ['pay', 'createAutopayment', 'processAutopayments']],
    InterbankService: ['interbankService', ['createTransfer', 'confirm', 'cancel', 'processClearing']],
    LoanService: ['loanService', ['apply', 'decide', 'sign', 'repayPartial', 'repayFull', 'processLoans']],
    TransferService: ['transferService', ['createTransfer', 'confirmTransfer', 'cancelTransfer', 'reviewHeldTransfer']],
    FraudService: ['fraudService', ['evaluate', 'evaluateInterbank', 'review']],
    ScoringService: ['scoringService', ['assess', 'trainAndActivate', 'activeModel']],
    OtpService: ['otpService', ['issue', 'verify']],
    LedgerService: ['ledgerService', ['post', 'reverse', 'balanceFromPostings', 'trialBalance']],
    AccountService: ['accountService', ['openForUser', 'closeForUser', 'setFrozen']],
    CardService: ['cardService', ['issueCard', 'setBlocked', 'updateLimits', 'purchase']],
    NotificationService: ['notificationService', ['notify', 'unreadCount']],
    MailService: ['mailService', ['sendCode', 'enqueue', 'processOutbox']],
    AuditService: ['auditService', ['log', 'latest']]
  };
  const mk = (n) => {
    const [file, m] = defs[n]; const methods = exportsOf(file, m);
    if (!methods.length) throw new Error(`Нет методов у ${n}`);
    return d.addClass({ name: n, stereotype: 'service', methods, fields: null, w: SW });
  };
  const dep = (pts, label, extra = {}) => d.addEdge({ kind: 'dependency', points: pts, marks: [], label, ...extra });
  return { d, mk, dep };
}

function services1() {
  const { d, mk, dep } = svcPage('Закрытие операционного дня');
  const x0 = 240, pitch = SW + 150;
  const B = { EodService: mk('EodService'), DepositService: mk('DepositService'), PaymentService: mk('PaymentService'), InterbankService: mk('InterbankService'), LoanService: mk('LoanService') };
  B.EodService.x = x0 + pitch / 2; B.EodService.y = 50;
  grid(B, [['DepositService', 'PaymentService'], ['InterbankService', 'LoanService']], { pitch, gap: 90, x0, y0: 50 + B.EodService.h + 120 });
  d.extraRight = 190;
  const Eod = B.EodService, yL = Eod.y + Eod.h + 55;
  const cx = (n) => B[n].x + SW / 2;
  dep([bottom(Eod, 0.12), [bottom(Eod, 0.12)[0], yL], [cx('DepositService'), yL], top(B.DepositService)], 'начисляет проценты', { labelSeg: 2, labelY: yL + 40 });
  dep([bottom(Eod, 0.88), [bottom(Eod, 0.88)[0], yL], [cx('PaymentService'), yL], top(B.PaymentService)], 'исполняет автоплатежи', { labelSeg: 2, labelY: yL + 40 });
  const xl = x0 - 60, xr = x0 + pitch + SW + 60;
  const yE = Eod.y + Eod.h / 2, yI = B.InterbankService.y + 62, yLn = B.LoanService.y + 62;
  dep([left(Eod), [xl, yE], [xl, yI], [B.InterbankService.x, yI]], 'отправляет клиринг', { labelSeg: 1, labelSide: 'left', labelY: (yE + yI) / 2 });
  dep([right(Eod), [xr, yE], [xr, yLn], [B.LoanService.x + SW, yLn]], 'ведёт график и пеню', { labelSeg: 1, labelY: (yE + yLn) / 2 });
  return d;
}

function services2() {
  const { d, mk, dep } = svcPage('Проверка, подтверждение и оценка операций');
  const pitch = SW + 110, x0 = 60;
  const B = { TransferService: mk('TransferService'), FraudService: mk('FraudService'), InterbankService: mk('InterbankService'), OtpService: mk('OtpService'), LoanService: mk('LoanService'), ScoringService: mk('ScoringService') };
  grid(B, [['TransferService', 'FraudService', 'InterbankService'], [null, 'OtpService', null], [null, 'LoanService', 'ScoringService']], { pitch, gap: 110, x0, y0: 50 });
  const yR = B.TransferService.y + 66;
  dep([[B.TransferService.x + SW, yR], [B.FraudService.x, yR]], 'проверяет');
  dep([[B.InterbankService.x, yR], [B.FraudService.x + SW, yR]], 'проверяет');
  const Otp = B.OtpService, yO = Otp.y + 50;
  dep([bottom(B.TransferService), [B.TransferService.x + SW / 2, yO], [Otp.x, yO]], 'подтверждает кодом', { labelSeg: 1 });
  dep([bottom(B.InterbankService), [B.InterbankService.x + SW / 2, yO], [Otp.x + SW, yO]], 'подтверждает кодом', { labelSeg: 1 });
  dep([top(B.LoanService), bottom(Otp)], 'подтверждает кодом');
  const yS = B.LoanService.y + 66;
  dep([[B.LoanService.x + SW, yS], [B.ScoringService.x, yS]], 'оценивает');
  return d;
}

function services3() {
  const { d, mk, dep } = svcPage('Счета, карты, уведомления и аудит');
  const pitch = SW + 140, x0 = 60;
  const B = { LedgerService: mk('LedgerService'), AccountService: mk('AccountService'), CardService: mk('CardService'), NotificationService: mk('NotificationService'), MailService: mk('MailService'), AuditService: mk('AuditService') };
  grid(B, [['LedgerService', 'AccountService', 'CardService'], ['NotificationService', 'MailService', 'AuditService']], { pitch, gap: 140, x0, y0: 90 });
  const bx = (names, title) => { const bs = names.map((n) => B[n]); const x = Math.min(...bs.map((b) => b.x)) - 24, y = Math.min(...bs.map((b) => b.y)) - 24; d.addPackage({ title, x, y, w: Math.max(...bs.map((b) => b.x + b.w)) + 24 - x, h: Math.max(...bs.map((b) => b.y + b.h)) + 24 - y }); };
  bx(['LedgerService', 'AccountService', 'CardService'], 'Счета, карты и учёт');
  bx(['NotificationService', 'MailService', 'AuditService'], 'Уведомления и аудит');
  const yN = B.NotificationService.y + 66;
  dep([[B.NotificationService.x + SW, yN], [B.MailService.x, yN]], 'ставит в очередь');
  return d;
}

const pages = [
  ['class-domain-1', domain1()], ['class-domain-2', domain2()], ['class-domain-3', domain3()], ['class-domain-4', domain4()],
  ['class-services-1', services1()], ['class-services-2', services2()], ['class-services-3', services3()]
];
writeFileSync(path.join(outDir, 'class-diagrams.drawio'), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map(([, p]) => p.drawio()).join('')}</mxfile>\n`);
for (const [n, p] of pages) {
  p.width = Math.max(...p.classes.map((c) => c.x + c.w), ...p.packages.map((k) => k.x + k.w)) + 90 + (p.extraRight ?? 0);
  p.height = Math.max(...p.classes.map((c) => c.y + c.h), ...p.packages.map((k) => k.y + k.h)) + 50;
  writeFileSync(path.join(outDir, `${n}.svg`), p.svg());
}
console.log(`Диаграммы классов: docs/diagrams/class-diagrams.drawio и ${pages.length} SVG`);
