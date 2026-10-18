// UML-модели представления для раздела 1.5: варианты использования, последовательности, деятельность,
// состояния, компоненты, развёртывание. Один код даёт файл draw.io и SVG-рисунки для записки.
// Использование: npm run uml:views. Результат: docs/diagrams/views.drawio и docs/diagrams/view-*.svg
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Diagram, FS, textWidth } from './lib/diagram.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/diagrams');
mkdirSync(outDir, { recursive: true });

const mid = (o) => [o.x + o.w / 2, o.y + o.h / 2];
const T = (o, t = 0.5) => [o.x + o.w * t, o.y];
const B = (o, t = 0.5) => [o.x + o.w * t, o.y + o.h];
const Lf = (o, t = 0.5) => [o.x, o.y + o.h * t];
const Rt = (o, t = 0.5) => [o.x + o.w, o.y + o.h * t];

/* =====================  Варианты использования  ===================== */
// По правилам методички: актёр — должность, вариант использования — эллипс с глаголом,
// «include» идёт от базового варианта к включаемому, «extend» — от расширяющего к базовому,
// обобщение (Клиент — Гость) — линия с пустым треугольником к родителю.
// Столбцы: A — основные действия клиента, B — включаемые и расширяющие, C — действия сотрудников.
function useCases() {
  const d = new Diagram('Варианты использования');
  const rx = 88, ry = 23, P = 56, y0 = 90;
  const cxA = 215, cxB = 471, cxC = 727, axL = 40, axR = 960;
  const Y = (r) => y0 + r * P;
  const mk = (cx, r, text) => ({ cx, cy: Y(r), rx, ry, text });
  d.frame({ x: 105, y: 30, w: 745, h: Y(19.15) - 30, title: 'Система ТалерБанк', center: true });

  const a = {
    rates: mk(cxA, 0, 'Просмотреть\nкурсы валют'), reg: mk(cxA, 1, 'Зарегистрироваться'), acc: mk(cxA, 2, 'Открыть счёт'),
    xfer: mk(cxA, 4, 'Перевести деньги'), pay: mk(cxA, 6, 'Оплатить услугу'), dep: mk(cxA, 8, 'Оформить вклад'),
    loan: mk(cxA, 10, 'Оформить кредит'), repay: mk(cxA, 12, 'Погасить кредит'), card: mk(cxA, 14, 'Выпустить карту'),
    stmt: mk(cxA, 16, 'Получить выписку')
  };
  const b = {
    conv: mk(cxB, 0, 'Рассчитать\nконвертацию'), form: mk(cxB, 1, 'Заполнить анкету'), iban: mk(cxB, 2, 'Сформировать\nномер IBAN'),
    fx: mk(cxB, 3, 'Конвертировать\nвалюту'), hold: mk(cxB, 4, 'Передать\nна проверку'), code: mk(cxB, 5, 'Подтвердить\nоперацию кодом'),
    auto: mk(cxB, 6, 'Настроить\nавтоплатёж'), tpl: mk(cxB, 7, 'Сохранить\nшаблон платежа'),
    calc: mk(cxB, 8, 'Рассчитать доход\nпо вкладу'), early: mk(cxB, 9, 'Закрыть вклад\nдосрочно'),
    score: mk(cxB, 10, 'Оценить кредито-\nспособность'), sched: mk(cxB, 11, 'Составить график\nплатежей'),
    prepay: mk(cxB, 12, 'Погасить\nдосрочно'), block: mk(cxB, 14, 'Заблокировать\nкарту'), limit: mk(cxB, 15, 'Установить\nлимиты'),
    pdf: mk(cxB, 16, 'Сформировать\nPDF-файл')
  };
  const c = {
    check: mk(cxC, 1, 'Проверить анкету\nклиента'), lock: mk(cxC, 2, 'Заблокировать\nсчёт клиента'), cash: mk(cxC, 3, 'Принять и выдать\nналичные'),
    fraud: mk(cxC, 4, 'Разобрать\nзадержанный перевод'), special: mk(cxC, 5.45, 'Назначить особый\nконтроль'),
    review: mk(cxC, 10, 'Рассмотреть заявку\nна кредит'), issue: mk(cxC, 11.45, 'Выдать средства\nпо кредиту'),
    rates: mk(cxC, 13, 'Задать курсы\nи тарифы'), users: mk(cxC, 14, 'Управлять\nпользователями'), audit: mk(cxC, 15, 'Просмотреть\nжурнал аудита'),
    report: mk(cxC, 16, 'Сформировать\nотчёты'), eod: mk(cxC, 17, 'Закрыть\nоперационный день'), backup: mk(cxC, 18.45, 'Создать\nрезервную копию')
  };
  for (const g of [a, b, c]) Object.values(g).forEach((e) => d.ellipse(e));

  // точка на границе эллипса в сторону заданной точки
  const edge = (e, [tx, ty]) => {
    const dx = tx - e.cx, dy = ty - e.cy; const k = 1 / Math.hypot(dx / e.rx, dy / e.ry);
    return [e.cx + dx * k, e.cy + dy * k];
  };
  const link = (from, to, kind) => {
    const p = edge(from, [to.cx, to.cy]); const q = edge(to, [from.cx, from.cy]);
    const horiz = Math.abs(p[1] - q[1]) < 3;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const vertical = Math.abs(p[0] - q[0]) < 3;
    d.line({
      pts: [p, q], dashed: true, arrow: 'open', label: `«${kind}»`, italic: true, size: 14,
      at: vertical ? { x: mx + 8, y: my + 5, anchor: 'start' } : { x: mx, y: my - (horiz ? 6 : 5) }
    });
  };
  const inc = (from, to) => link(from, to, 'include');
  const ext = (from, to) => link(from, to, 'extend');

  // включение: от базового варианта к включаемому
  inc(a.reg, b.form); inc(a.acc, b.iban); inc(a.xfer, b.code); inc(a.pay, b.code); inc(a.dep, b.calc);
  inc(a.loan, b.score); inc(a.loan, b.sched); inc(c.review, b.score); inc(b.hold, c.fraud); inc(c.eod, c.backup);
  // расширение: от расширяющего варианта к базовому
  ext(b.conv, a.rates); ext(b.fx, a.xfer); ext(b.hold, a.xfer); ext(b.auto, a.pay); ext(b.tpl, a.pay); ext(b.early, a.dep);
  ext(b.prepay, a.repay); ext(b.block, a.card); ext(b.limit, a.card); ext(b.pdf, a.stmt);
  ext(c.special, c.fraud); ext(c.issue, c.review);

  // актёры слева: Гость и Клиент (обобщение)
  const actor = (cx, rMid, name) => { d.actor({ cx, y: Y(rMid) - 37, name }); return Y(rMid); };
  const gy = actor(axL, 0.5, 'Гость');
  const cy = actor(axL, 9, 'Клиент');
  d.line({ pts: [[axL, cy - 37], [axL, Y(0.5) - 37 + 102]], arrow: 'hollow' });
  const assoc = (ax, ay, e, side, ends) => {
    const start = [ax + side * 22, ay];
    const q = [e.cx - side * e.rx, e.cy];
    d.line({ pts: [start, q], arrow: null });
    return { start, q, ends };
  };
  const g = [assoc(axL, gy, a.rates, 1), assoc(axL, gy, a.reg, 1)];
  ['acc', 'xfer', 'pay', 'dep', 'loan', 'repay', 'card', 'stmt'].forEach((k) => assoc(axL, cy, a[k], 1));
  void g;
  // сотрудники справа
  const staff = (name, rMid, cases) => {
    const sy = actor(axR, rMid, name);
    for (const e of cases) {
      const start = [axR - 22, sy]; d.line({ pts: [start, [e.cx + e.rx, e.cy]], arrow: null });
    }
  };
  staff('Операционист', 2, [c.check, c.lock, c.cash]);
  staff('Специалист по\nмониторингу', 4.5, [c.fraud, c.special]);
  staff('Кредитный\nспециалист', 10.5, [c.review, c.issue]);
  staff('Администратор', 15.7, [c.rates, c.users, c.audit, c.report, c.eod, c.backup]);

  d.checkCrossings = () => {
    const segs = d.items.filter((i) => i.t === 'line').map((l) => l.pts);
    const bad = [];
    const ccw = (A, B2, C) => (C[1] - A[1]) * (B2[0] - A[0]) - (B2[1] - A[1]) * (C[0] - A[0]);
    const inter = (p1, p2, p3, p4) => {
      const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
      return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
    };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (inter(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) bad.push(['линия×линия', i, j, segs[i][0], segs[j][0]]);
    }
    const ells = d.items.filter((i) => i.t === 'ellipse');
    segs.forEach((s, i) => {
      for (const e of ells) {
        for (let t = 0.05; t < 0.96; t += 0.05) {
          const x = s[0][0] + (s[1][0] - s[0][0]) * t, y = s[0][1] + (s[1][1] - s[0][1]) * t;
          if (((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 < 0.97) { bad.push(['линия×эллипс', i, e.text]); break; }
        }
      }
    });
    return bad;
  };
  return d;
}
const ucAll = useCases();
const ucBad = ucAll.checkCrossings();
if (ucBad.length) console.warn('Вариант использования: пересечения', JSON.stringify(ucBad));

/* =====================  Диаграммы последовательности  ===================== */
// По методичке: объект изображается прямоугольником «имя : Класс» (подчёркнуто, у анонимного объекта только «: Класс»),
// инициатор взаимодействия (актёр) стоит слева, линия жизни пунктирная, период активности показан фокусом управления,
// сообщения подписаны именами операций с круглыми скобками, рефлексивное сообщение рисуется на фокусе управления.
// Каждый поток управления показан на отдельной диаграмме (панели одного рисунка).
const call = (from, to, name, calls = [], ret = false) => ({ from, to, name, calls, ret });
const selfCall = (on, name) => ({ self: on, name });

/** Рисует одну диаграмму последовательности в прямоугольнике «sd …» с левым верхним углом (x0, y0). Возвращает высоту. */
function sequencePanel(d, x0, y0, title, parts, steps, width) {
  const ROW = 40; const HEAD_Y = y0 + 40;
  const pitch = width / parts.length;
  const cx = (key) => x0 + pitch * (parts.findIndex((p) => p.key === key) + 0.5);
  const firstY = HEAD_Y + 122;
  const marks = []; const acts = new Map(parts.map((p) => [p.key, []]));
  let y = firstY;
  let n = 0;
  const run = (step) => {
    if (step.open) { marks.push({ open: step.open, guard: step.guard, y }); y += 48; return; }
    if (step.close) { marks.push({ close: true, y: y - 8 }); y += 14; return; }
    if (step.text) { marks.push({ text: step.text, y: y + 4 }); y += 48; return; }
    if (step.self) {
      marks.push({ self: step.self, name: `${++n} : ${step.name}`, y });
      y += ROW + 20;
      return;
    }
    const yCall = y;
    marks.push({ from: step.from, to: step.to, name: `${++n} : ${step.name}`, y: yCall });
    y += ROW;
    for (const c of step.calls) run(c);
    let yEnd = y - ROW + 14;
    if (step.ret) { marks.push({ from: step.to, to: step.from, name: '', y, ret: true }); yEnd = y + 6; y += ROW - 6; }
    acts.get(step.to).push([yCall - 6, yEnd]);
  };
  for (const s of steps) run(s);
  const bottom = y + 10;
  // фокус управления инициатора занимает весь период взаимодействия
  for (const p of parts.filter((q) => q.actor)) acts.get(p.key).push([firstY - 6, bottom - 18]);

  d.frame({ x: x0, y: y0, w: width, h: bottom - y0, stroke: '#000', dashed: false, fill: 'none' });
  d.rect({ x: x0, y: y0, w: Math.max(150, title.length * 8.6 + 44), h: 26, text: `sd ${title}`, size: 15, bold: true });
  for (const p of parts) {
    const x = cx(p.key);
    if (p.actor) {
      d.actor({ cx: x, y: HEAD_Y, name: p.label });
      d.line({ pts: [[x, HEAD_Y + 106], [x, bottom - 6]], arrow: null, dashed: true });
    } else {
      const w = Math.min(pitch - 18, p.label.length * 8.4 + 26);
      d.rect({ x: x - w / 2, y: HEAD_Y + 40, w, h: 36, text: p.label, size: 16, underline: true });
      d.line({ pts: [[x, HEAD_Y + 76], [x, bottom - 6]], arrow: null, dashed: true });
    }
    for (const [a, b] of acts.get(p.key)) d.rect({ x: x - 6, y: a, w: 12, h: b - a, text: '' });
  }
  const opens = [];
  for (const m of marks) {
    if (m.open) opens.push(m);
    else if (m.close) {
      const o = opens.pop();
      d.rect({ x: x0 + 8, y: o.y, w: width - 16, h: m.y - o.y, text: '', fill: 'none' });
      d.rect({ x: x0 + 8, y: o.y, w: 58, h: 24, text: o.open, size: 14, bold: true });
      d.text({ x: x0 + 76, y: o.y + 18, text: o.guard, size: 15, italic: true });
    } else if (m.text) d.text({ x: x0 + 76, y: m.y + 14, text: m.text, size: 15, italic: true });
  }
  for (const m of marks) {
    if (m.open || m.close || m.text) continue;
    if (m.self) {
      const x = cx(m.self);
      d.rect({ x: x + 6, y: m.y + 8, w: 12, h: 26, text: '' });
      d.line({ pts: [[x + 6, m.y + 8], [x + 44, m.y + 8], [x + 44, m.y + 28], [x + 18, m.y + 28]], arrow: 'filled', label: m.name, at: { x: x + 52, y: m.y + 23, anchor: 'start' }, italic: false });
    } else {
      const right = cx(m.to) > cx(m.from);
      const xa = cx(m.from) + (right ? 6 : -6); const xb = cx(m.to) + (right ? -6 : 6);
      d.line({ pts: [[xa, m.y], [xb, m.y]], arrow: m.ret ? 'open' : 'filled', dashed: Boolean(m.ret), label: m.name || undefined, at: { x: (xa + xb) / 2, y: m.y - 7 }, italic: false });
    }
  }
  return bottom - y0;
}

function seqLoan() {
  const d = new Diagram('Оформление кредита');
  const parts = [
    { key: 'cl', label: 'Клиент', actor: true }, { key: 'ct', label: ':LoanController' }, { key: 'sv', label: ':LoanService' },
    { key: 'sc', label: ':ScoringService' }, { key: 'md', label: ':LoanModel' }, { key: 'ot', label: ':OtpService' },
    { key: 'lg', label: ':LedgerService' }, { key: 'of', label: 'Кредитный\nспециалист', actor: true }
  ];
  const steps = [
    call('cl', 'ct', 'create()', [call('ct', 'sv', 'apply()', [
      selfCall('sv', 'buildSchedule()'), selfCall('sv', 'scoreApplication()'),
      call('sv', 'sc', 'activeModel()'), call('sv', 'sc', 'assess()')
    ])]),
    { open: 'alt1', guard: '[отказ: долговая нагрузка выше 40 % или вероятность дефолта выше 30 %]' },
    call('sv', 'md', 'insertApplication()'),
    { close: true },
    { text: '[иначе: вероятность дефолта до 30 %]' },
    { open: 'alt2', guard: '[ручное рассмотрение: вероятность от 8 до 30 % или сумма выше лимита]' },
    call('sv', 'md', 'insertApplication()'),
    call('of', 'sv', 'decide()', [call('sv', 'md', 'lockApplication()'), call('sv', 'md', 'decideApplication()')]),
    { close: true },
    { text: '[иначе: автоодобрение, вероятность до 8 % и сумма в пределах лимита]' },
    call('sv', 'md', 'insertApplication()'),
    { text: '[заявка одобрена: подписание договора]' },
    call('cl', 'ct', 'sendCode()', [call('ct', 'sv', 'requestSignCode()', [call('sv', 'ot', 'issue()')])]),
    call('cl', 'ct', 'sign()', [call('ct', 'sv', 'sign()', [
      call('sv', 'ot', 'verify()'), call('sv', 'md', 'lockApplication()'), call('sv', 'md', 'insertLoan()'),
      call('sv', 'md', 'insertInstallments()'), call('sv', 'lg', 'post()'), call('sv', 'md', 'setApplicationStatus()')
    ])])
  ];
  sequencePanel(d, 20, 16, 'Оформление кредита', parts, steps, 1560);
  return d;
}

/* =====================  Диаграммы деятельности  ===================== */
function lanes(d, titles, width, height, top = 30) {
  const lw = width / titles.length;
  titles.forEach((t, i) => {
    d.frame({ x: i * lw, y: top, w: lw, h: height - top, stroke: '#000', dashed: false });
    d.rect({ x: i * lw, y: top, w: lw, h: 34, text: t, bold: true, fill: '#f2f2f2' });
  });
  return (i) => i * lw + lw / 2;
}
const act = (d, cxv, cy, text, w = 230, h = 46) => d.rect({ x: cxv - w / 2, y: cy - h / 2, w, h, round: 20, text });
const dec = (d, cxv, cy, text, w = 200, h = 92) => { const o = d.diamond({ cx: cxv, cy, w, h, text, size: 15 }); return { x: cxv - w / 2, y: cy - h / 2, w, h, cx: cxv, cy }; };
const arrow = (d, pts, label, at) => d.line({ pts, label, at, italic: true });

function actLoan() {
  const d = new Diagram('Оформление кредита');
  const W = 960; const H = 1140;
  const C = lanes(d, ['Клиент', 'Система', 'Кредитный специалист'], W, H);
  const c0 = C(0); const c1 = C(1); const c2 = C(2);
  d.mark({ kind: 'start', cx: c0, cy: 110 });
  const a1 = act(d, c0, 175, 'Заявка: сумма, срок, доход,\nобязательства, счёт', 250);
  arrow(d, [[c0, 120], [c0, a1.y]]);
  const a2 = act(d, c1, 275, 'Расчёт графика платежей\nи долговой нагрузки (ДН)', 260);
  arrow(d, [Rt(a1), [c1, 175], [c1, a2.y]]);
  const d1 = dec(d, c1, 385, 'ДН выше\n40 %?');
  arrow(d, [B(a2), T(d1)]);
  d.mark({ kind: 'end', cx: c0, cy: 385 });
  arrow(d, [Lf(d1), [c0 + 10, 385]], 'да: отказ', { x: (d1.x + c0) / 2, y: 378 });
  const a3 = act(d, c1, 500, 'Скоринг: вероятность\nдефолта (PD)', 240);
  arrow(d, [B(d1), T(a3)], 'нет', { x: c1 + 8, y: 456, anchor: 'start' });
  const d2 = dec(d, c1, 625, 'Значение PD', 210, 100);
  arrow(d, [B(a3), T(d2)]);
  d.mark({ kind: 'end', cx: c0, cy: 625 });
  arrow(d, [Lf(d2), [c0 + 10, 625]], 'выше 30 %: отказ', { x: (d2.x + c0) / 2, y: 618 });
  const a5 = act(d, c2, 625, 'Рассмотрение заявки\nкредитным специалистом', 250);
  arrow(d, [Rt(d2), Lf(a5)], 'от 8 до 30 %', { x: (d2.x + d2.w + a5.x) / 2, y: 618 });
  const a4 = act(d, c1, 790, 'Заявка одобрена', 220);
  arrow(d, [B(d2), T(a4)], 'до 8 %,\nсумма в лимите', { x: c1 + 8, y: 700, anchor: 'start' });
  const d3 = dec(d, c2, 760, 'Решение', 170, 80);
  arrow(d, [B(a5), T(d3)]);
  arrow(d, [Lf(d3), [c1 + 135, 760], [c1 + 135, a4.y + 23], Rt(a4)], 'одобрить', { x: (c1 + 135 + d3.x) / 2, y: 752 });
  d.mark({ kind: 'end', cx: c2, cy: 880 });
  arrow(d, [B(d3), [c2, 870]], 'отказать', { x: c2 + 8, y: 835, anchor: 'start' });
  const a6 = act(d, c0, 905, 'Подписание договора\nкодом из письма', 240);
  arrow(d, [B(a4), [c1, 905], Rt(a6)]);
  const a7 = act(d, c1, 985, 'Выдача кредита: ссудный счёт,\nграфик платежей, проводка', 270);
  arrow(d, [B(a6), [c0, 985], Lf(a7)]);
  d.mark({ kind: 'end', cx: c1, cy: 1075 });
  arrow(d, [B(a7), [c1, 1065]]);
  return d;
}

/* =====================  Диаграммы состояний  ===================== */
const st = (d, x, y, text, w = 190, h = 60) => d.rect({ x, y, w, h, round: 22, text });

function stLoanApp() {
  const d = new Diagram('Состояния заявки на кредит');
  d.mark({ kind: 'start', cx: 50, cy: 250 });
  const mr = st(d, 330, 70, 'manual_review\nна рассмотрении', 220);
  const rj = st(d, 330, 220, 'rejected\nотказано', 220);
  const ap = st(d, 330, 370, 'approved\nодобрена', 220);
  const sg = st(d, 730, 385, 'signed\nдоговор подписан', 220);
  d.line({ pts: [[50, 240], [50, 100], [330, 100]], label: 'PD до 30 %', at: { x: 190, y: 92 } });
  d.line({ pts: [[60, 250], [330, 250]], label: 'ДН выше 40 %\nили PD выше 30 %', at: { x: 195, y: 212 } });
  d.line({ pts: [[50, 260], [50, 400], [330, 400]], label: 'PD до 8 %,\nсумма в лимите', at: { x: 190, y: 362 } });
  d.line({ pts: [[440, 130], [440, 220]], label: 'отказал\nспециалист', at: { x: 448, y: 168, anchor: 'start' } });
  d.line({ pts: [[550, 100], [640, 100], [640, 385], [550, 385]], label: 'одобрил\nспециалист', at: { x: 648, y: 240, anchor: 'start' } });
  d.line({ pts: [[550, 415], [730, 415]], label: 'подписание\nкодом', at: { x: 640, y: 450 } });
  d.mark({ kind: 'end', cx: 590, cy: 250 });
  d.line({ pts: [[550, 250], [580, 250]] });
  d.mark({ kind: 'end', cx: 1010, cy: 415 });
  d.line({ pts: [[950, 415], [1000, 415]] });
  void mr; void rj; void ap; void sg;
  return d;
}

/* =====================  Компоненты и развёртывание  ===================== */
function components() {
  const d = new Diagram('Диаграмма компонентов');
  d.frame({ x: 20, y: 20, w: 250, h: 330, title: 'Браузер клиента', center: true });
  const pg = d.component({ x: 60, y: 80, w: 170, h: 60, text: 'Страница index.html\nи стили (CSS)' });
  const js = d.component({ x: 60, y: 170, w: 170, h: 60, text: 'Модули страниц и\nмаршрутизатор (JS)' });
  d.frame({ x: 340, y: 20, w: 560, h: 560, title: 'Сервер приложения (Node.js, Express 5)', center: true });
  const mw = d.component({ x: 400, y: 170, w: 200, h: 50, text: 'Промежуточные слои:\nсессии, CSRF, права, 2FA' });
  const rt = d.component({ x: 650, y: 80, w: 200, h: 50, text: 'Маршруты (routes)' });
  const ct = d.component({ x: 650, y: 170, w: 200, h: 50, text: 'Контроллеры (JSON)' });
  const vw = d.component({ x: 400, y: 80, w: 200, h: 50, text: 'Раздача файлов\nинтерфейса (public)' });
  const sv = d.component({ x: 650, y: 260, w: 200, h: 60, text: 'Сервисы:\nбизнес-логика' });
  const lb = d.component({ x: 400, y: 260, w: 200, h: 60, text: 'Библиотеки: деньги,\nIBAN, TOTP, PDF' });
  const md = d.component({ x: 650, y: 360, w: 200, h: 50, text: 'Модели (SQL-запросы)' });
  const jb = d.component({ x: 400, y: 440, w: 200, h: 60, text: 'Фоновые задачи: копии,\nочередь писем' });
  void mw;
  d.frame({ x: 970, y: 330, w: 250, h: 150, title: 'MySQL 8', center: true });
  const db = d.component({ x: 1010, y: 380, w: 170, h: 70, text: 'Таблицы, триггеры,\nсессии' });
  d.frame({ x: 970, y: 20, w: 250, h: 120, title: 'Национальный банк', center: true });
  const nb = d.component({ x: 1010, y: 70, w: 170, h: 50, text: 'API курсов\napi.nbrb.by' });
  d.frame({ x: 970, y: 170, w: 250, h: 120, title: 'Почтовый сервер', center: true });
  const sm = d.component({ x: 1010, y: 220, w: 170, h: 50, text: 'SMTP' });
  d.frame({ x: 970, y: 510, w: 250, h: 100, title: 'Хранилище копий', center: true });
  const bk = d.component({ x: 1010, y: 550, w: 170, h: 40, text: 'Файлы (AES-256-GCM)' });
  d.line({ pts: [Rt(pg), Lf(vw)], label: 'HTTPS', at: { x: 305, y: 85 }, arrow: 'open' });
  d.line({ pts: [Rt(js), Lf(mw)], label: 'HTTPS, JSON', at: { x: 305, y: 175 }, arrow: 'open' });
  d.line({ pts: [Rt(mw), Lf(rt)], arrow: 'open' });
  d.line({ pts: [B(rt), T(ct)], arrow: 'open' });
  d.line({ pts: [B(ct), T(sv)], arrow: 'open' });
  d.line({ pts: [Lf(sv), Rt(lb)], arrow: 'open' });
  d.line({ pts: [B(sv), T(md)], arrow: 'open' });
  d.line({ pts: [Rt(md), [930, md.y + 25], [930, db.y + 35], Lf(db)], arrow: 'open', label: 'SQL', at: { x: 948, y: 400 } });
  d.line({ pts: [Rt(sv, 0.2), [915, sv.y + 12], [915, nb.y + 25], Lf(nb)], arrow: 'open', label: 'HTTPS', at: { x: 925, y: 150, anchor: 'start' } });
  d.line({ pts: [Rt(sv, 0.7), [945, sv.y + 42], [945, sm.y + 25], Lf(sm)], arrow: 'open', label: 'SMTP', at: { x: 953, y: 300, anchor: 'start' } });
  d.line({ pts: [Rt(jb), [920, jb.y + 30], [920, bk.y + 20], Lf(bk)], arrow: 'open', label: 'файлы', at: { x: 930, y: 540, anchor: 'start' } });
  void db;
  return d;
}

function deployment() {
  const d = new Diagram('Диаграмма развёртывания');
  const pc = d.node({ x: 30, y: 120, w: 240, h: 150, title: '«device» Компьютер клиента', text: 'Браузер: Яндекс, Firefox,\nChrome, Opera' });
  const app = d.node({ x: 400, y: 80, w: 300, h: 230, title: '«server» Сервер приложения', text: 'Обратный прокси (nginx, Caddy)\nс сертификатом TLS\n\nNode.js 20+, Express 5\nAPI и файлы интерфейса' });
  const db = d.node({ x: 830, y: 120, w: 240, h: 150, title: '«server» Сервер БД', text: 'MySQL 8 (InnoDB)\nбаза talerbank' });
  const mail = d.node({ x: 400, y: 430, w: 300, h: 100, title: '«server» Почтовый сервер', text: 'SMTP (коды и уведомления)' });
  const nb = d.node({ x: 30, y: 430, w: 280, h: 100, title: '«server» Нацбанк', text: 'api.nbrb.by (курсы валют)' });
  const bk = d.node({ x: 830, y: 430, w: 240, h: 100, title: '«device» Хранилище', text: 'Резервные копии\n(шифрование AES-256-GCM)' });
  d.line({ pts: [[pc.x + pc.w + 16, 200], [app.x, 200]], arrow: null, label: 'HTTPS', at: { x: 343, y: 192 } });
  d.line({ pts: [[app.x + app.w + 16, 200], [db.x, 200]], arrow: null, label: 'TCP 3306 (SQL)', at: { x: 770, y: 192 } });
  d.line({ pts: [[app.x + 150, app.y + app.h], [app.x + 150, mail.y - 14]], arrow: null, label: 'SMTP', at: { x: app.x + 158, y: 385, anchor: 'start' } });
  d.line({ pts: [[app.x + 40, app.y + app.h], [app.x + 40, 380], [170, 380], [170, nb.y - 14]], arrow: null, label: 'HTTPS (JSON)', at: { x: 255, y: 372 } });
  d.line({ pts: [[app.x + 260, app.y + app.h], [app.x + 260, 380], [950, 380], [950, bk.y - 14]], arrow: null, label: 'файлы копий', at: { x: 810, y: 372 } });
  void textWidth; void FS; void mid; void B; void T;
  return d;
}

const pages = [
  ['uc', ucAll], ['seq-loan', seqLoan()], ['act-loan', actLoan()], ['st-loan', stLoanApp()], ['components', components()], ['deployment', deployment()]
];
writeFileSync(path.join(outDir, 'views.drawio'), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map(([, p]) => p.drawio()).join('')}</mxfile>\n`);
for (const [n, p] of pages) writeFileSync(path.join(outDir, `view-${n}.svg`), p.svg());
console.log(`Модели представления: docs/diagrams/views.drawio и ${pages.length} SVG`);
