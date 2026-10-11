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
  if (vertical) return { text, x: p[0] + (off ? 12 : 7), y: p[1] + (q[1] > p[1] ? 16 + off : -6 - off) };
  return { text, x: p[0] + (q[0] > p[0] ? 6 + off : -6 - off), y: p[1] - 6, anchor: q[0] > p[0] ? 'start' : 'end' };
}
/** Горизонтальная связь между соседями по ряду: обе точки на одной высоте, a левее b. */
const hline = (a, b) => { const y = Math.max(a.y, b.y) + 38; return [[a.x + a.w, y], [b.x, y]]; };
function link(d, kind, pts, m1, m2, extra = {}) {
  const marks = [];
  if (m1) marks.push(mult(pts[0], pts[1], m1, kind === 'aggregation' || kind === 'composition' ? 22 : 0));
  if (m2) marks.push(mult(pts[pts.length - 1], pts[pts.length - 2], m2));
  d.addEdge({ kind, points: pts, marks, arrow: extra.arrow });
}

/** Раскладка по сетке: ряды выравниваются по верху, шаг по горизонтали задан. */
function grid(boxes, rows, { pitch = 330, gap = 100, x0 = 50, y0 = 50 } = {}) {
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

/* =====================  1. Модель предметной области  ===================== */
function domain() {
  const d = new ClassDiagram('Классы предметной области', { width: 1800, height: 1500 });
  const c = (spec) => d.addClass({ w: 230, ...spec });
  const B = {
    Role: c({ name: 'Role', fields: ['- id: number', '- code: string', '- name: string'], methods: ['+ hasPermission(code): boolean'] }),
    User: c({ name: 'User', fields: ['- id: number', '- login: string', '- passwordHash: string', '- status: string', '- failedAttempts: number'], methods: ['+ authenticate(password): boolean', '+ block(): void', '+ changeRole(role): void'] }),
    Client: c({ name: 'Client', fields: ['- id: number', '- lastName: string', '- firstName: string', '- patronymic: string', '- birthDate: Date', '- kycStatus: string'], methods: ['+ verify(operator): void', '+ reject(comment): void', '+ getFullName(): string'] }),
    LoanProduct: c({ name: 'LoanProduct', fields: ['- id: number', '- name: string', '- ratePercent: number', '- minAmount: number', '- maxAmount: number'], methods: ['+ buildSchedule(amount, term): Installment[]'], w: 270 }),
    LoanApplication: c({ name: 'LoanApplication', fields: ['- id: number', '- amount: number', '- termMonths: number', '- scheduleType: ScheduleType', '- score: number', '- pdPercent: number', '- status: string'], methods: ['+ assess(): Decision', '+ approve(): void', '+ reject(comment): void'], w: 250 }),
    Account: c({ name: 'Account', fields: ['- id: number', '- iban: string', '- kind: string', '- currency: string', '- balance: number', '- status: string'], methods: ['+ open(): void', '+ close(): void', '+ freeze(reason): void', '+ getBalance(): number'] }),
    Deposit: c({ name: 'Deposit', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- openedDate: Date', '- maturityDate: Date', '- status: string'], methods: ['+ accrueInterest(): number', '+ quoteEarlyClose(): number', '+ closeEarly(): number'] }),
    DepositProduct: c({ name: 'DepositProduct', fields: ['- id: number', '- name: string', '- currency: string', '- termMonths: number', '- ratePercent: number', '- capitalization: boolean'], methods: ['+ calculateIncome(amount): number'], w: 250 }),
    Loan: c({ name: 'Loan', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- termMonths: number', '- principalBalance: number', '- status: string'], methods: ['+ repayPartial(amount, mode): void', '+ repayFull(): void', '+ accruePenalty(): number'] }),
    ScheduleType: c({ name: 'ScheduleType', stereotype: 'enumeration', fields: ['annuity', 'differentiated'], methods: null, w: 170 }),
    Card: c({ name: 'Card', fields: ['- id: number', '- system: string', '- numberEnc: string', '- last4: string', '- dailyLimit: number', '- status: string'], methods: ['+ block(): void', '+ updateLimits(limits): void', '+ purchase(amount): void'] }),
    Payment: c({ name: 'Payment', fields: ['- id: number', '- requisite: string', '- amount: number', '- fee: number', '- source: string'], methods: ['+ execute(): void', '+ getReceipt(): Receipt'] }),
    TransferRequest: c({ name: 'TransferRequest', fields: ['- id: string', '- kind: string', '- amount: number', '- amountByn: number', '- fee: number', '- status: string'], methods: ['+ confirm(code): void', '+ cancel(): void', '+ evaluateRisk(): Risk'], w: 250 }),
    Document: c({ name: 'Document', fields: ['- id: number', '- type: string', '- status: string', '- idempotencyKey: string', '- bankDate: Date'], methods: ['+ post(entries): void', '+ reverse(): void'] }),
    Posting: c({ name: 'Posting', fields: ['- id: number', '- debitAccount: Account', '- creditAccount: Account', '- amount: number', '- bankDate: Date'], methods: ['+ getAmount(): number'], w: 250 })
  };
  grid(B, [
    ['Role', 'User', 'Client', null, null],
    ['LoanProduct', 'LoanApplication', 'Account', 'Deposit', 'DepositProduct'],
    ['ScheduleType', 'Loan', 'Card', 'Payment', 'TransferRequest'],
    [null, null, 'Posting', 'Document', null]
  ], { pitch: 340, gap: 110 });

  const L = (kind, pts, a, b, extra) => link(d, kind, pts, a, b, extra);
  L('association', hline(B.Role, B.User), '1', '0..*');
  L('association', hline(B.User, B.Client), '1', '0..1');
  L('aggregation', [bottom(B.Client, 0.55), top(B.Account, 0.55)], '1', '0..*');
  { const p = bottom(B.Client, 0.12), q = top(B.LoanApplication, 0.5), y = B.Client.y + B.Client.h + 38; L('aggregation', [p, [p[0], y], [q[0], y], q], '1', '0..*'); }
  { const p = right(B.Client, 0.55), q = top(B.Deposit, 0.5); L('aggregation', [p, [q[0], p[1]], q], '1', '0..*'); }
  L('association', hline(B.LoanProduct, B.LoanApplication), '1', '0..*');
  L('association', hline(B.Deposit, B.DepositProduct), '0..*', '1');
  { const x = Math.round((Math.max(B.LoanApplication.x, B.Loan.x) + Math.min(B.LoanApplication.x + B.LoanApplication.w, B.Loan.x + B.Loan.w)) / 2); L('association', [[x, B.LoanApplication.y + B.LoanApplication.h], [x, B.Loan.y]], '1', '0..1'); }
  L('association', hline(B.ScheduleType, B.Loan).reverse(), '', '', { arrow: true });
  L('association', hline(B.Account, B.Deposit), '1', '0..*');
  { const p = left(B.Account, 0.8), q = right(B.Loan, 0.4), x = B.Account.x - 45; L('association', [p, [x, p[1]], [x, q[1]], q], '1', '0..*'); }
  L('association', [bottom(B.Account, 0.5), top(B.Card, 0.5)], '1', '0..*');
  { const p = bottom(B.Account, 0.82), q = top(B.Payment, 0.35), y = B.Account.y + B.Account.h + 30; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*'); }
  { const p = bottom(B.Account, 0.95), q = top(B.TransferRequest, 0.35), y = B.Account.y + B.Account.h + 55; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*'); }
  { const p = left(B.Account, 0.93), q = left(B.Posting, 0.5), x = B.Account.x - 25; L('association', [p, [x, p[1]], [x, q[1]], q], '1', '0..*'); }
  L('composition', hline(B.Posting, B.Document).reverse(), '1', '1..*');
  L('association', [top(B.Document, 0.4), bottom(B.Payment, 0.4)], '1', '0..*');
  { const p = top(B.Document, 0.8), q = bottom(B.TransferRequest, 0.4), y = B.Document.y - 40; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*'); }
  return d;
}

/* =====================  2. Слой бизнес-логики  ===================== */
function services() {
  const exportsOf = (file, names) => {
    const text = readFileSync(path.join(root, 'src/services', `${file}.js`), 'utf8');
    return names.filter((n) => new RegExp(`export (?:async )?function ${n}\\b|export const ${n}\\b`).test(text)).map((n) => `+ ${n}()`);
  };
  const d = new ClassDiagram('Слой бизнес-логики', { width: 1500, height: 1300 });
  const s = (name, file, methods) => d.addClass({ name, stereotype: 'service', methods: exportsOf(file, methods), fields: null, w: 250 });
  const B = {
    EodService: s('EodService', 'eodService', ['closeDay', 'advanceDays', 'currentBankDate']),
    DepositService: s('DepositService', 'depositService', ['openDeposit', 'closeEarly', 'processDeposits', 'projectIncome']),
    PaymentService: s('PaymentService', 'paymentService', ['pay', 'createAutopayment', 'processAutopayments']),
    CardService: s('CardService', 'cardService', ['issueCard', 'setBlocked', 'updateLimits', 'purchase']),
    LoanService: s('LoanService', 'loanService', ['apply', 'decide', 'sign', 'repayPartial', 'repayFull', 'processLoans']),
    TransferService: s('TransferService', 'transferService', ['createTransfer', 'confirmTransfer', 'reviewHeldTransfer']),
    FraudService: s('FraudService', 'fraudService', ['evaluate', 'evaluateInterbank', 'review']),
    InterbankService: s('InterbankService', 'interbankService', ['createTransfer', 'confirm', 'cancel', 'processClearing']),
    ScoringService: s('ScoringService', 'scoringService', ['assess', 'trainAndActivate', 'activeModel']),
    LedgerService: s('LedgerService', 'ledgerService', ['post', 'reverse', 'balanceFromPostings', 'trialBalance']),
    AccountService: s('AccountService', 'accountService', ['openForUser', 'closeForUser', 'setFrozen']),
    OtpService: s('OtpService', 'otpService', ['issue', 'verify']),
    NotificationService: s('NotificationService', 'notificationService', ['notify', 'unreadCount']),
    MailService: s('MailService', 'mailService', ['sendCode', 'enqueue', 'processOutbox']),
    AuditService: s('AuditService', 'auditService', ['log', 'latest'])
  };
  const bands = [
    ['Закрытие операционного дня', [[null, 'EodService', null, null]]],
    ['Банковские продукты', [['DepositService', 'PaymentService', 'CardService', 'LoanService']]],
    ['Переводы и принятие решений', [['TransferService', 'FraudService', 'InterbankService', 'ScoringService']]],
    ['Учёт и безопасность', [['LedgerService', 'AccountService', 'OtpService', null]]],
    ['Уведомления и аудит', [['NotificationService', 'MailService', 'AuditService', null]]]
  ];
  const pitch = 330, x0 = 80, pad = 24, bandGap = 90;
  let y = 60;
  const bandBox = {};
  bands.forEach(([title, rows], bi) => {
    const top0 = y + pad;
    grid(B, rows, { pitch, gap: 0, x0, y0: top0 });
    const names = rows.flat().filter(Boolean);
    const h = Math.max(...names.map((n) => B[n].h));
    const pkg = { title, x: x0 - pad, y: y, w: pitch * 3 + 250 + pad * 2, h: h + pad * 2 };
    d.addPackage(pkg);
    bandBox[bi] = pkg;
    y += pkg.h + bandGap;
  });
  const dep = (pts) => d.addEdge({ kind: 'dependency', points: pts, marks: [] });
  const straight = (a, ta, b, tb) => dep([bottom(B[a], ta), top(B[b], tb)]);
  const elbow = (a, ta, b, tb, yy) => { const p = bottom(B[a], ta), q = top(B[b], tb); dep([p, [p[0], yy], [q[0], yy], q]); };
  const gapY = (bi, k) => bandBox[bi].y + bandBox[bi].h + 20 + k * 14;
  // Закрытие дня запускает обработку вкладов, платежей и кредитов
  elbow('EodService', 0.2, 'DepositService', 0.7, gapY(0, 1));
  elbow('EodService', 0.5, 'PaymentService', 0.5, gapY(0, 1));
  elbow('EodService', 0.8, 'LoanService', 0.5, gapY(0, 1));
  // Кредит решается скорингом
  straight('LoanService', 0.5, 'ScoringService', 0.5);
  // Перевод и межбанковский перевод проходят антифрод, код и проводку
  dep([right(B.TransferService, 0.5), left(B.FraudService, 0.5)]);
  dep([left(B.InterbankService, 0.5), right(B.FraudService, 0.5)]);
  straight('TransferService', 0.6, 'LedgerService', 0.6);
  elbow('TransferService', 0.85, 'OtpService', 0.1, gapY(2, 0));
  elbow('InterbankService', 0.5, 'LedgerService', 0.85, gapY(2, 2));
  straight('InterbankService', 0.7, 'OtpService', 0.7);
  // Уведомление ставит письмо в очередь
  dep([right(B.NotificationService, 0.5), left(B.MailService, 0.5)]);
  d.label('Вклады, платежи, кредиты, карты и переводы проводят деньги через LedgerService; эти зависимости опущены для наглядности.', x0 - pad, y - bandGap + 40, { size: 13, italic: true });
  return d;
}

const pages = [domain(), services()];
writeFileSync(path.join(outDir, 'class-diagrams.drawio'), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map((p) => p.drawio()).join('')}</mxfile>\n`);
const names = ['class-domain', 'class-services'];
pages.forEach((p, i) => {
  p.width = Math.max(...p.classes.map((c) => c.x + c.w)) + 60;
  p.height = Math.max(...p.classes.map((c) => c.y + c.h), ...p.labels.map((l) => l.y)) + 60;
  writeFileSync(path.join(outDir, `${names[i]}.svg`), p.svg());
});
console.log('Диаграммы классов: docs/diagrams/class-diagrams.drawio, class-domain.svg, class-services.svg');
