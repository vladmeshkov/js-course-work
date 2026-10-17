// Диаграммы классов UML для записки: ядро модели предметной области и слой бизнес-логики (две диаграммы).
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

/* =====================  1. Ядро модели предметной области  ===================== */
// Атрибуты соответствуют столбцам таблиц БД (db/sql), операции: функциям сервисов src/services.
function domain() {
  const d = new ClassDiagram('Классы предметной области', { width: 1300, height: 1300 });
  const W = 270;
  const c = (spec) => d.addClass({ w: W, ...spec });
  const B = {
    Deposit: c({ name: 'Deposit', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- maturityDate: Date', '- status: string'], methods: ['+ quoteEarlyClose(): number', '+ closeEarly(): void'] }),
    Client: c({ name: 'Client', fields: ['- id: number', '- lastName: string', '- firstName: string', '- birthDate: Date', '- kycStatus: string'], methods: ['+ verifyClient(): void', '+ rejectClient(): void'] }),
    LoanApplication: c({ name: 'LoanApplication', fields: ['- id: number', '- amount: number', '- termMonths: number', '- pdPercent: number', '- status: string'], methods: ['+ apply(): void', '+ decide(): void', '+ sign(): Loan'] }),
    Card: c({ name: 'Card', fields: ['- id: number', '- last4: string', '- dailyLimit: number', '- status: string'], methods: ['+ setBlocked(): void', '+ updateLimits(): void', '+ purchase(): void'] }),
    Account: c({ name: 'Account', fields: ['- id: number', '- iban: string', '- currency: string', '- balance: number', '- status: string'], methods: ['+ openForUser(): void', '+ closeForUser(): void'] }),
    Loan: c({ name: 'Loan', fields: ['- id: number', '- amount: number', '- ratePercent: number', '- principalBalance: number', '- status: string'], methods: ['+ repayPartial(): void', '+ repayFull(): void'] }),
    Payment: c({ name: 'Payment', fields: ['- id: number', '- requisite: string', '- amount: number', '- fee: number'], methods: ['+ pay(): void', '+ getReceipt(): Receipt'] }),
    Posting: c({ name: 'Posting', fields: ['- id: number', '- debitAccount: Account', '- creditAccount: Account', '- amount: number'], methods: [] }),
    TransferIntent: c({ name: 'TransferIntent', fields: ['- id: string', '- kind: string', '- amount: number', '- fee: number', '- status: string'], methods: ['+ confirmTransfer(): void', '+ cancelTransfer(): void'] }),
    Document: c({ name: 'Document', fields: ['- id: number', '- type: string', '- status: string', '- idempotencyKey: string'], methods: ['+ post(): void', '+ reverse(): void'] })
  };
  grid(B, [['Deposit', 'Client', 'LoanApplication'], ['Card', 'Account', 'Loan'], ['Payment', 'Posting', 'TransferIntent'], [null, 'Document', null]],
    { pitch: W + 125, gap: 100, x0: 40, y0: 40 });
  // ряд 2 выше остальных: выровнять верх по строке не нужно, grid уже ставит ряды друг под другом
  const L = (kind, pts, a, b, extra) => link(d, kind, pts, a, b, extra);
  const y1 = B.Client.y + 50, y2 = B.Account.y + 50;
  L('aggregation', [[B.Client.x, y1], [B.Deposit.x + W, y1]], '1', '0..*', { label: 'открывает' });
  L('aggregation', [[B.Client.x + W, y1], [B.LoanApplication.x, y1]], '1', '0..*', { label: 'подаёт' });
  L('aggregation', [bottom(B.Client), top(B.Account)], '1', '0..*', { label: 'владеет' });
  L('association', [[B.Account.x, y2], [B.Card.x + W, y2]], '1', '0..*', { label: 'обслуживает' });
  L('association', [bottom(B.LoanApplication), top(B.Loan)], '1', '0..1', { label: 'порождает' });
  L('association', [[B.Account.x + W, y2], [B.Loan.x, y2]], '1', '0..*', { label: 'погашает' });
  L('association', [bottom(B.Account), top(B.Posting)], '1', '0..*', { label: 'участвует в' });
  const lane = Math.max(B.Account.y + B.Account.h, B.Card.y + B.Card.h, B.Loan.y + B.Loan.h) + 45;
  { const p = [B.Account.x + 35, B.Account.y + B.Account.h], q = top(B.Payment); L('association', [p, [p[0], lane], [q[0], lane], q], '1', '0..*', { label: 'оплачивает', seg: 1 }); }
  { const p = [B.Account.x + W - 35, B.Account.y + B.Account.h], q = top(B.TransferIntent); L('association', [p, [p[0], lane], [q[0], lane], q], '1', '0..*', { label: 'отправляет', seg: 1 }); }
  L('composition', [top(B.Document), bottom(B.Posting)], '1', '1..*', { label: 'содержит' });
  const yd = B.Document.y + 50;
  L('association', [[B.Document.x, yd], [B.Payment.x + W / 2, yd], bottom(B.Payment)], '1', '0..*', { label: 'оформляет', seg: 0 });
  L('association', [[B.Document.x + W, yd], [B.TransferIntent.x + W / 2, yd], bottom(B.TransferIntent)], '1', '0..*', { label: 'оформляет', seg: 0 });
  return d;
}

/* =====================  2. Слой бизнес-логики  ===================== */
// Методы берутся из реальных export в src/services; стрелки соответствуют импортам между сервисами.
function services() {
  const exportsOf = (file, names) => {
    const text = readFileSync(path.join(root, 'src/services', `${file}.js`), 'utf8');
    return names.filter((n) => new RegExp(`export (?:async )?function ${n}\\b|export const ${n}\\b`).test(text)).map((n) => `+ ${n}()`);
  };
  const d = new ClassDiagram('Слой бизнес-логики', { width: 1300, height: 1300 });
  const W = 240;
  const defs = {
    EodService: ['eodService', ['closeDay', 'advanceDays', 'currentBankDate']],
    DepositService: ['depositService', ['openDeposit', 'closeEarly', 'processDeposits']],
    PaymentService: ['paymentService', ['pay', 'createAutopayment', 'processAutopayments']],
    LoanService: ['loanService', ['apply', 'decide', 'sign', 'repayFull', 'processLoans']],
    TransferService: ['transferService', ['createTransfer', 'confirmTransfer', 'reviewHeldTransfer']],
    OtpService: ['otpService', ['issue', 'verify']],
    ScoringService: ['scoringService', ['assess', 'trainAndActivate']],
    FraudService: ['fraudService', ['evaluate', 'evaluateInterbank', 'review']],
    InterbankService: ['interbankService', ['createTransfer', 'confirm', 'processClearing']]
  };
  const B = {};
  for (const [n, [file, m]] of Object.entries(defs)) {
    const methods = exportsOf(file, m);
    if (methods.length !== m.length) throw new Error(`Нет методов у ${n}`);
    B[n] = d.addClass({ name: n, stereotype: 'service', methods, fields: null, w: W });
  }
  const pitch = W + 115, x0 = 50;
  grid(B, [[null, 'EodService', null], ['DepositService', 'PaymentService', 'LoanService'], ['TransferService', 'OtpService', 'ScoringService'], ['FraudService', 'InterbankService', null]], { pitch, gap: 105, x0, y0: 40 });
  const dep = (pts, label, extra = {}) => d.addEdge({ kind: 'dependency', points: pts, marks: [], label, ...extra });
  const Eod = B.EodService, lane1 = Eod.y + Eod.h + 32;
  const cx = (n) => B[n].x + W / 2;
  dep([bottom(Eod, 0.12), [bottom(Eod, 0.12)[0], lane1], [cx('DepositService'), lane1], top(B.DepositService)], 'начисляет проценты', { labelSeg: 1 });
  dep([bottom(Eod), top(B.PaymentService)], 'исполняет автоплатежи', { labelY: B.PaymentService.y - 22 });
  dep([bottom(Eod, 0.88), [bottom(Eod, 0.88)[0], lane1], [cx('LoanService'), lane1], top(B.LoanService)], 'ведёт графики', { labelSeg: 1 });
  const xr = B.LoanService.x + W + 55, yI = B.InterbankService.y + 62;
  dep([right(Eod, 0.5), [xr, right(Eod, 0.5)[1]], [xr, yI], [B.InterbankService.x + W, yI]], 'отправляет клиринг', { labelSeg: 1, labelY: B.LoanService.y + 50 });
  dep([bottom(B.LoanService), top(B.ScoringService)], 'оценивает заёмщика');
  const lane2 = Math.max(B.DepositService.y + B.DepositService.h, B.PaymentService.y + B.PaymentService.h, B.LoanService.y + B.LoanService.h) + 38;
  dep([[B.LoanService.x + 28, B.LoanService.y + B.LoanService.h], [B.LoanService.x + 28, lane2], [B.OtpService.x + W * 0.8, lane2], [B.OtpService.x + W * 0.8, B.OtpService.y]], 'подтверждает', { labelSeg: 1 });
  const yT = B.TransferService.y + 64;
  dep([[B.TransferService.x + W, yT], [B.OtpService.x, yT]], 'подтверждает');
  dep([bottom(B.TransferService), top(B.FraudService)], 'проверяет');
  const yF = B.FraudService.y + 62;
  dep([[B.InterbankService.x, yF], [B.FraudService.x + W, yF]], 'проверяет');
  dep([top(B.InterbankService), bottom(B.OtpService)], 'подтверждает');
  return d;
}

const pages = [['class-domain', domain()], ['class-services', services()]];
writeFileSync(path.join(outDir, 'class-diagrams.drawio'), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map(([, p]) => p.drawio()).join('')}</mxfile>\n`);
for (const [n, p] of pages) {
  p.width = Math.max(...p.classes.map((c) => c.x + c.w)) + (n === 'class-services' ? 230 : 100);
  p.height = Math.max(...p.classes.map((c) => c.y + c.h)) + 50;
  writeFileSync(path.join(outDir, `${n}.svg`), p.svg());
}
console.log(`Диаграммы классов: docs/diagrams/class-diagrams.drawio, class-domain.svg, class-services.svg`);
