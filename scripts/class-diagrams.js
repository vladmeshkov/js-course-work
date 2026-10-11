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
const hline = (a, b) => { const y = Math.max(a.y, b.y) + 44; return [[a.x + a.w, y], [b.x, y]]; };
function link(d, kind, pts, m1, m2, extra = {}) {
  const marks = [];
  if (m1) marks.push(mult(pts[0], pts[1], m1, kind === 'aggregation' || kind === 'composition' ? 24 : 0));
  if (m2) marks.push(mult(pts[pts.length - 1], pts[pts.length - 2], m2));
  d.addEdge({ kind, points: pts, marks, arrow: extra.arrow, label: extra.label, labelSeg: extra.seg, labelY: extra.labelY });
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
// Атрибуты соответствуют столбцам таблиц БД (db/sql), операции: функциям сервисов src/services.
function domain() {
  const d = new ClassDiagram('Классы предметной области', { width: 2300, height: 1900 });
  const c = (spec) => d.addClass({ w: 300, ...spec });
  const B = {
    Role: c({ name: 'Role', fields: ['- id: number', '- code: string', '- name: string', '- permissions: string[]'], methods: [] }),
    User: c({ name: 'User', fields: ['- id: number', '- login: string', '- passwordHash: string', '- status: string', '- failedAttempts: number', '- totpEnabled: boolean'], methods: ['+ login(password): Session', '+ setBlocked(blocked): void', '+ changeRole(role): void'] }),
    Client: c({ name: 'Client', fields: ['- id: number', '- lastName: string', '- firstName: string', '- patronymic: string', '- birthDate: Date', '- kycStatus: string'], methods: ['+ verifyClient(): void', '+ rejectClient(comment): void'] }),
    LoanProduct: c({ name: 'LoanProduct', fields: ['- id: number', '- name: string', '- ratePercent: number', '- minAmount: number', '- maxAmount: number', '- minTerm: number', '- maxTerm: number'], methods: ['+ previewSchedule(): Installment[]'] }),
    LoanApplication: c({ name: 'LoanApplication', fields: ['- id: number', '- amount: number', '- termMonths: number', '- scheduleType: ScheduleType', '- dtiPercent: number', '- score: number', '- pdPercent: number', '- status: string'], methods: ['+ apply(): void', '+ decide(approve): void', '+ sign(code): Loan'] }),
    Account: c({ name: 'Account', fields: ['- id: number', '- iban: string', '- kind: string', '- currency: string', '- balance: number', '- status: string'], methods: ['+ openForUser(): void', '+ closeForUser(): void', '+ setFrozen(frozen): void'] }),
    Deposit: c({ name: 'Deposit', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- openedDate: Date', '- maturityDate: Date', '- interestTotal: number', '- status: string'], methods: ['+ quoteEarlyClose(): number', '+ closeEarly(): void'] }),
    DepositProduct: c({ name: 'DepositProduct', fields: ['- id: number', '- name: string', '- currency: string', '- termMonths: number', '- ratePercent: number', '- capitalization: boolean', '- revocable: boolean'], methods: ['+ projectIncome(amount): number'] }),
    Loan: c({ name: 'Loan', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- termMonths: number', '- principalBalance: number', '- status: string'], methods: ['+ quoteFull(): number', '+ repayPartial(amount): void', '+ repayFull(): void'] }),
    ScheduleType: c({ name: 'ScheduleType', stereotype: 'enumeration', fields: ['annuity', 'differentiated'], methods: null, w: 200 }),
    Card: c({ name: 'Card', fields: ['- id: number', '- system: string', '- numberEnc: string', '- last4: string', '- dailyLimit: number', '- onlineEnabled: boolean', '- status: string'], methods: ['+ setBlocked(blocked): void', '+ updateLimits(limits): void', '+ purchase(amount): void'] }),
    Payment: c({ name: 'Payment', fields: ['- id: number', '- requisite: string', '- amount: number', '- fee: number', '- source: string'], methods: ['+ pay(): void', '+ getReceipt(): Receipt'] }),
    TransferIntent: c({ name: 'TransferIntent', fields: ['- id: string', '- kind: string', '- amount: number', '- amountByn: number', '- fee: number', '- status: string', '- expiresAt: Date'], methods: ['+ confirmTransfer(code): void', '+ cancelTransfer(): void'] }),
    Document: c({ name: 'Document', fields: ['- id: number', '- type: string', '- status: string', '- idempotencyKey: string', '- bankDate: Date'], methods: ['+ post(entries): void', '+ reverse(): void'] }),
    Posting: c({ name: 'Posting', fields: ['- id: number', '- debitAccount: Account', '- creditAccount: Account', '- amount: number', '- bankDate: Date'], methods: [] })
  };
  grid(B, [
    ['Role', 'User', 'Client', null, null],
    ['LoanProduct', 'LoanApplication', 'Account', 'Deposit', 'DepositProduct'],
    ['ScheduleType', 'Loan', 'Card', 'Payment', 'TransferIntent'],
    [null, null, 'Posting', 'Document', null]
  ], { pitch: 450, gap: 140, x0: 90 });
  B.ScheduleType.x = B.LoanProduct.x + (B.LoanProduct.w - B.ScheduleType.w) / 2;

  const L = (kind, pts, a, b, extra) => link(d, kind, pts, a, b, extra);
  L('association', hline(B.Role, B.User), '1', '0..*', { label: 'присвоена' });
  L('association', hline(B.User, B.Client), '1', '0..1', { label: 'соответствует' });
  L('aggregation', [bottom(B.Client, 0.55), top(B.Account, 0.55)], '1', '0..*', { label: 'владеет' });
  { const p = bottom(B.Client, 0.12), q = top(B.LoanApplication, 0.5), y = B.Client.y + B.Client.h + 44; L('aggregation', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'подаёт', seg: 1 }); }
  { const p = right(B.Client, 0.55), q = top(B.Deposit, 0.5); L('aggregation', [p, [q[0], p[1]], q], '1', '0..*', { label: 'открывает', seg: 0 }); }
  L('association', hline(B.LoanProduct, B.LoanApplication), '1', '0..*', { label: 'оформляется по' });
  L('association', hline(B.Deposit, B.DepositProduct), '0..*', '1', { label: 'открыт по' });
  { const x = Math.round((Math.max(B.LoanApplication.x, B.Loan.x) + Math.min(B.LoanApplication.x + B.LoanApplication.w, B.Loan.x + B.Loan.w)) / 2); L('association', [[x, B.LoanApplication.y + B.LoanApplication.h], [x, B.Loan.y]], '1', '0..1', { label: 'порождает' }); }
  L('association', hline(B.ScheduleType, B.Loan).reverse(), '', '', { arrow: true, label: 'использует' });
  L('association', hline(B.Account, B.Deposit), '1', '0..*', { label: 'хранит' });
  { const p = left(B.Account, 0.8), q = right(B.Loan, 0.4), x = B.Account.x - 55; L('association', [p, [x, p[1]], [x, q[1]], q], '1', '0..*', { label: 'погашает', seg: 1 }); }
  L('association', [bottom(B.Account, 0.5), top(B.Card, 0.5)], '1', '0..*', { label: 'обслуживает' });
  { const p = bottom(B.Account, 0.82), q = top(B.Payment, 0.35), y = B.Account.y + B.Account.h + 70; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'оплачивает', seg: 1 }); }
  { const p = bottom(B.Account, 0.95), q = top(B.TransferIntent, 0.35), y = B.Account.y + B.Account.h + 30; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'отправляет', seg: 1 }); }
  { const p = left(B.Account, 0.93), q = left(B.Posting, 0.5), x = B.Account.x - 30; L('association', [p, [x, p[1]], [x, q[1]], q], '1', '0..*', { label: 'участвует в', seg: 1, labelY: B.Card.y + B.Card.h + 45 }); }
  L('composition', hline(B.Posting, B.Document).reverse(), '1', '1..*', { label: 'содержит' });
  L('association', [top(B.Document, 0.4), bottom(B.Payment, 0.4)], '1', '0..*', { label: 'оформляет' });
  { const p = top(B.Document, 0.8), q = bottom(B.TransferIntent, 0.4), y = B.Document.y - 48; L('association', [p, [p[0], y], [q[0], y], q], '1', '0..*', { label: 'оформляет', seg: 1 }); }
  return d;
}

/* =====================  2. Слой бизнес-логики  ===================== */
// Методы берутся из реальных export в src/services; стрелки соответствуют импортам между сервисами.
function services() {
  const exportsOf = (file, names) => {
    const text = readFileSync(path.join(root, 'src/services', `${file}.js`), 'utf8');
    return names.filter((n) => new RegExp(`export (?:async )?function ${n}\\b|export const ${n}\\b`).test(text)).map((n) => `+ ${n}()`);
  };
  const d = new ClassDiagram('Слой бизнес-логики', { width: 1700, height: 1500 });
  const W = 290, pitch = 400, x0 = 90;
  const s = (name, file, methods) => d.addClass({ name, stereotype: 'service', methods: exportsOf(file, methods), fields: null, w: W });
  const B = {
    EodService: s('EodService', 'eodService', ['closeDay', 'advanceDays', 'currentBankDate']),
    DepositService: s('DepositService', 'depositService', ['openDeposit', 'closeEarly', 'processDeposits', 'projectIncome']),
    PaymentService: s('PaymentService', 'paymentService', ['pay', 'createAutopayment', 'processAutopayments']),
    InterbankService: s('InterbankService', 'interbankService', ['createTransfer', 'confirm', 'cancel', 'processClearing']),
    LoanService: s('LoanService', 'loanService', ['apply', 'decide', 'sign', 'repayPartial', 'repayFull', 'processLoans']),
    TransferService: s('TransferService', 'transferService', ['createTransfer', 'confirmTransfer', 'cancelTransfer', 'reviewHeldTransfer']),
    FraudService: s('FraudService', 'fraudService', ['evaluate', 'evaluateInterbank', 'review']),
    ScoringService: s('ScoringService', 'scoringService', ['assess', 'trainAndActivate', 'activeModel']),
    OtpService: s('OtpService', 'otpService', ['issue', 'verify']),
    LedgerService: s('LedgerService', 'ledgerService', ['post', 'reverse', 'balanceFromPostings', 'trialBalance']),
    AccountService: s('AccountService', 'accountService', ['openForUser', 'closeForUser', 'setFrozen']),
    CardService: s('CardService', 'cardService', ['issueCard', 'setBlocked', 'updateLimits', 'purchase']),
    NotificationService: s('NotificationService', 'notificationService', ['notify', 'unreadCount']),
    MailService: s('MailService', 'mailService', ['sendCode', 'enqueue', 'processOutbox']),
    AuditService: s('AuditService', 'auditService', ['log', 'latest'])
  };
  for (const [n, b] of Object.entries(B)) if (!b.methods.length) throw new Error(`Нет методов у ${n}`);
  const at = (n, col, y) => { B[n].x = x0 + col * pitch; B[n].y = y; };
  const pad = 26;
  const bands = [
    { title: 'Закрытие операционного дня', gap: 130, rows: [[['EodService', 1.5]]] },
    { title: 'Операции, выполняемые при закрытии дня', gap: 110, rows: [[['DepositService', 0], ['PaymentService', 1], ['InterbankService', 2], ['LoanService', 3]]] },
    { title: 'Переводы и контроль операций', gap: 90, rows: [[['TransferService', 1], ['FraudService', 2], ['ScoringService', 3]], [['OtpService', 2.75]]], rowGap: 110 },
    { title: 'Счета, карты и учёт', gap: 90, rows: [[['LedgerService', 0], ['AccountService', 1], ['CardService', 2]]] },
    { title: 'Уведомления и аудит', gap: 0, rows: [[['NotificationService', 0], ['MailService', 1], ['AuditService', 2]]] }
  ];
  const pk = [];
  let y = 70;
  for (const band of bands) {
    let ry = y + pad;
    const names = [];
    band.rows.forEach((row) => {
      let h = 0;
      row.forEach(([n, col]) => { at(n, col, ry); h = Math.max(h, B[n].h); names.push(n); });
      ry += h + (band.rowGap ?? 0);
    });
    const bottomY = Math.max(...names.map((n) => B[n].y + B[n].h));
    const pkg = { title: band.title, x: x0 - pad, y, w: pitch * 3 + W + pad * 2, h: bottomY + pad - y };
    d.addPackage(pkg); pk.push(pkg);
    y = pkg.y + pkg.h + band.gap;
  }
  const dep = (pts, label, extra = {}) => d.addEdge({ kind: 'dependency', points: pts, marks: [], label, ...extra });
  const cx = (n, t = 0.5) => Math.round(B[n].x + B[n].w * t);
  const Eod = B.EodService;
  // Закрытие дня запускает обработку вкладов, платежей, клиринга и кредитов (вложенные дорожки без пересечений)
  const yA = pk[0].y + pk[0].h + 22, yB = yA + 26;
  const drop = (name, startX, lane, label, seg) => dep([[startX, Eod.y + Eod.h], [startX, lane], [cx(name), lane], top(B[name])], label, { labelSeg: seg, labelY: seg === 2 ? lane + 30 : undefined });
  drop('DepositService', Eod.x + 30, yA, 'начисляет проценты', 1);
  drop('PaymentService', Eod.x + 80, yB, 'исполняет автоплатежи', 2);
  drop('LoanService', Eod.x + Eod.w - 30, yA, 'ведёт график и пеню', 1);
  drop('InterbankService', Eod.x + Eod.w - 80, yB, 'отправляет клиринг', 2);
  // Кредит оценивается скорингом
  dep([bottom(B.LoanService), top(B.ScoringService)], 'оценивает заёмщика');
  // Перевод и межбанковский перевод проверяются антифродом
  const yRow = B.TransferService.y + 64;
  dep([[B.TransferService.x + W, yRow], [B.FraudService.x, yRow]], 'проверяет');
  dep([bottom(B.InterbankService), top(B.FraudService)], 'проверяет');
  // Код подтверждения нужен переводу, межбанковскому переводу и подписанию кредита
  const Otp = B.OtpService;
  const lane = Math.round(B.FraudService.x + W + (pitch - W) / 2);
  const yJ = B.InterbankService.y + 70;
  dep([[B.InterbankService.x + W, yJ], [lane, yJ], [lane, Otp.y]], 'подтверждает кодом', { labelSeg: 1, labelY: Otp.y - 22 });
  dep([[B.LoanService.x, yJ], [lane, yJ]], '', { noArrow: true });
  const yO = Otp.y + 55;
  dep([bottom(B.TransferService, 0.5), [cx('TransferService'), yO], [Otp.x, yO]], 'подтверждает кодом', { labelSeg: 1 });
  // Уведомление ставит письмо в очередь
  const yN = B.NotificationService.y + 64;
  dep([[B.NotificationService.x + W, yN], [B.MailService.x, yN]], 'ставит в очередь');
  d.label('Сервисы вкладов, платежей, кредитов, карт и переводов также используют AccountService, LedgerService, AuditService и NotificationService; на рисунке эти связи опущены.', x0 - pad, y - 20 + 60, { size: 15, italic: true });
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
