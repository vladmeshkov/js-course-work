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
// По правилам методички: актёр – роль, вариант использования – эллипс с глаголом, «include» идёт от базового
// варианта к включаемому, «extend» – от расширяющего к базовому, обобщение – линия с пустым треугольником.
// Расстановка ручная (как в учебных диаграммах StarUML): основные варианты крупнее, включаемые и расширяющие
// мельче и стоят рядом с базовыми, общие для всех ролей варианты (вход, безопасность) – в отдельном пакете.
function useCases() {
  const d = new Diagram('Варианты использования');
  const U = (cx, cy, rx, ry, text, size = 14) => d.ellipse({ cx, cy, rx, ry, text, size });

  d.frame({ x: 175, y: 0, w: 1190, h: 1275, title: 'Диаграмма вариантов использования', center: true, size: 19 });
  d.frame({ x: 800, y: 770, w: 565, h: 420, title: 'Общие варианты использования', center: true, size: 13 });

  // клиент: основные варианты дугой, выгнутой от актёра (линии от актёра не пересекают соседние эллипсы)
  const acc = U(287, 75, 92, 27, 'Открыть счёт', 15);
  const xfer = U(337, 168, 112, 33, 'Перевести\nденьги', 16);
  const pay = U(359, 268, 104, 30, 'Оплатить\nуслугу', 15);
  const dep = U(378, 368, 100, 29, 'Оформить вклад', 15);
  const loan = U(390, 468, 112, 33, 'Оформить\nкредит', 16);
  const repay = U(353, 568, 96, 27, 'Погасить кредит', 14);
  const card = U(322, 663, 90, 26, 'Выпустить карту', 14);
  const stmt = U(294, 758, 92, 26, 'Получить выписку', 14);
  // включаемые и расширяющие варианты клиента
  const fx = U(565, 92, 90, 24, 'Конвертировать\nвалюту', 13);
  const hold = U(870, 130, 86, 24, 'Передать\nна проверку', 13);
  const code = U(700, 218, 118, 30, 'Подтвердить\nоперацию кодом', 15);
  const tpl = U(650, 300, 86, 23, 'Сохранить\nшаблон', 13);
  const auto = U(600, 352, 90, 23, 'Настроить\nавтоплатёж', 13);
  const calc = U(640, 455, 96, 25, 'Рассчитать доход\nпо вкладу', 13);
  const early = U(800, 410, 88, 23, 'Закрыть вклад\nдосрочно', 13);
  const score = U(800, 572, 120, 33, 'Оценить\nкредитоспособность', 15);
  const sched = U(600, 618, 88, 24, 'Составить\nграфик', 13);
  const prepay = U(625, 690, 82, 22, 'Погасить\nдосрочно', 12);
  const block = U(612, 748, 88, 23, 'Заблокировать\nкарту', 13);
  const limit = U(585, 832, 86, 23, 'Установить\nлимиты', 13);
  const pdf = U(395, 880, 88, 23, 'Сформировать\nPDF', 13);

  // администратор (внизу слева), та же дуга
  const trf = U(300, 950, 100, 25, 'Задать курсы\nи тарифы', 14);
  const users = U(344, 1004, 104, 26, 'Управлять\nпользователями', 14);
  const audit = U(372, 1058, 98, 25, 'Просмотреть\nжурнал аудита', 14);
  const eod = U(392, 1114, 120, 29, 'Закрыть\nоперационный день', 15);
  const reports = U(330, 1170, 90, 24, 'Сформировать\nотчёты', 13);
  const backup = U(305, 1226, 104, 25, 'Создать резервную\nкопию', 13);
  const accrue = U(680, 1080, 92, 23, 'Начислить\nпроценты', 12), charge = U(690, 1165, 92, 23, 'Списать платежи\nпо кредитам', 12);

  // сотрудники (справа)
  const kyc = U(1130, 75, 112, 30, 'Проверить анкету\nклиента', 15);
  const cash = U(1215, 155, 104, 27, 'Принять и выдать\nналичные', 14);
  const lock = U(1150, 228, 96, 26, 'Заблокировать\nсчёт', 14);
  const fraud = U(1125, 330, 124, 34, 'Разобрать\nзадержанный перевод', 15);
  const special = U(985, 438, 90, 24, 'Назначить особый\nконтроль', 12);
  const review = U(1140, 505, 120, 33, 'Рассмотреть заявку\nна кредит', 15);
  const issue = U(1010, 635, 90, 24, 'Выдать средства\nпо кредиту', 12);

  // общие варианты: базовые ближе к «Пользователю», включаемые и расширяющие дальше от него
  const reg = U(1185, 835, 100, 27, 'Зарегистрироваться', 14), form = U(955, 820, 80, 22, 'Заполнить\nанкету', 12);
  const auth = U(1230, 910, 100, 28, 'Авторизоваться', 15), tfa = U(990, 905, 92, 24, 'Подтвердить вход\nкодом 2FA', 12);
  const rates = U(1240, 985, 96, 26, 'Просмотреть\nкурсы валют', 14), conv = U(1005, 985, 84, 22, 'Рассчитать\nконвертацию', 12);
  const sec = U(1175, 1062, 98, 26, 'Управлять\nбезопасностью', 14), notif = U(1270, 1140, 92, 24, 'Просмотреть\nуведомления', 13);

  const edge = (e, [tx, ty]) => {
    const dx = tx - e.cx, dy = ty - e.cy; const k = 1 / Math.hypot(dx / e.rx, dy / e.ry);
    return [e.cx + dx * k, e.cy + dy * k];
  };
  const link = (from, to, kind) => {
    const p = edge(from, [to.cx, to.cy]); const q = edge(to, [from.cx, from.cy]);
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const vertical = Math.abs(p[0] - q[0]) < Math.abs(p[1] - q[1]);
    d.line({ pts: [p, q], dashed: true, arrow: 'open', label: `«${kind}»`, size: 12,
      at: vertical ? { x: mx + 6, y: my + 4, anchor: 'start' } : { x: mx, y: my - 5 } });
  };
  const inc = (a, b) => link(a, b, 'include');
  const ext = (a, b) => link(a, b, 'extend');
  ext(fx, xfer); inc(xfer, code); inc(pay, code); ext(hold, xfer); inc(hold, fraud);
  ext(tpl, pay); ext(auto, pay); inc(dep, calc); ext(early, dep);
  inc(loan, score); inc(loan, sched); inc(review, score); ext(issue, review); ext(prepay, repay);
  ext(block, card); ext(limit, card); inc(stmt, pdf);
  ext(special, fraud); inc(eod, accrue); inc(eod, charge);
  inc(reg, form); ext(tfa, auth); ext(conv, rates);

  // актёры: ассоциации – простые линии без стрелок, как в учебных диаграммах
  const actor = (cx, mid, name) => { d.actor({ cx, y: mid - 37, name }); return [cx, mid]; };
  // линия идёт в крайнюю точку эллипса со стороны актёра: варианты стоят дугой, и линии проходят между ними
  const assoc = ([ax, ay], side, cases) => {
    for (const e of cases) d.line({ pts: [[ax + side * 22, ay], [e.cx - side * e.rx, e.cy]], arrow: null });
  };
  const client = actor(95, 415, 'Клиент'), admin = actor(95, 1088, 'Администратор');
  const op = actor(1450, 120, 'Операционист'), mon = actor(1450, 345, 'Специалист по\nмониторингу');
  const cr = actor(1450, 560, 'Кредитный\nспециалист'), user = actor(1450, 985, 'Пользователь');
  assoc(client, 1, [acc, xfer, pay, dep, loan, repay, card, stmt]);
  assoc(admin, 1, [trf, users, audit, eod, reports, backup]);
  assoc(op, -1, [kyc, cash, lock]); assoc(mon, -1, [fraud, special]); assoc(cr, -1, [review, issue]);
  assoc(user, -1, [reg, auth, rates, sec, notif]);

  // обобщение: все роли наследуют «Пользователя»; линии идут ломаными вокруг рамки системы
  const uFeet = user[1] + 37;
  d.line({ pts: [[73, client[1]], [30, client[1]], [30, 1320], [1440, 1320], [1440, uFeet + 2]], arrow: 'hollow' });
  d.line({ pts: [[95, admin[1] + 70], [95, 1305], [1460, 1305], [1460, uFeet + 2]], arrow: 'hollow' });
  d.line({ pts: [[1472, op[1]], [1530, op[1]], [1530, user[1] - 12], [1474, user[1] - 12]], arrow: 'hollow' });
  d.line({ pts: [[1472, mon[1]], [1515, mon[1]], [1515, user[1] + 2], [1474, user[1] + 2]], arrow: 'hollow' });
  d.line({ pts: [[1472, cr[1]], [1500, cr[1]], [1500, user[1] + 16], [1474, user[1] + 16]], arrow: 'hollow' });

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
const show = (from, to, name) => ({ dash: true, from, to, name });

/** Рисует одну диаграмму последовательности в прямоугольнике «sd …» с левым верхним углом (x0, y0). Возвращает высоту. */
function sequencePanel(d, x0, y0, title, parts, steps, width, holdKey = null) {
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
    if (step.dash) {
      marks.push({ from: step.from, to: step.to, name: `${++n} : ${step.name}`, y, ret: true });
      y += ROW;
      return;
    }
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
    if (step.ret) { marks.push({ from: step.to, to: step.from, name: typeof step.ret === 'string' ? `${++n} : ${step.ret}` : '', y, ret: true }); yEnd = y + 6; y += ROW - 6; }
    acts.get(step.to).push([yCall - 6, yEnd]);
  };
  for (const s of steps) run(s);
  const bottom = y + 10;
  // фокус управления инициатора занимает весь период взаимодействия
  if (holdKey) {
    const first = marks.find((m) => m.to === holdKey);
    acts.get(holdKey).length = 0;
    acts.get(holdKey).push([first.y - 6, bottom - 18]);
  }
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
      d.rect({ x: x - w / 2, y: HEAD_Y + 40, w, h: 36, text: p.label, size: 16, underline: true, bold: true });
      d.line({ pts: [[x, HEAD_Y + 76], [x, bottom - 6]], arrow: null, dashed: true });
    }
    for (const [a, b] of acts.get(p.key)) d.rect({ x: x - 6, y: a, w: 12, h: b - a, text: '' });
  }
  const opens = []; const notes = [];
  for (const m of marks) {
    if (m.open) opens.push(m);
    else if (m.close) {
      const o = opens.pop();
      d.rect({ x: x0 + 8, y: o.y, w: width - 16, h: m.y - o.y, text: '', fill: 'none' });
      notes.push({ x: x0 + 8, y: o.y, label: o.open, guard: o.guard });
    } else if (m.text) notes.push({ x: x0 + 8, y: m.y - 8, guard: m.text });
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
  // названия блоков и условия рисуются последними, на белой подложке: линии жизни их не пересекают
  const gx = cx(parts.find((q) => q.actor).key) + 18;
  for (const nt of notes) {
    if (nt.label) d.rect({ x: nt.x, y: nt.y, w: 58, h: 24, text: nt.label, size: 14, bold: true });
    const w = nt.guard.length * 7.4 + 16;
    d.rect({ x: gx, y: nt.y + (nt.label ? 4 : 6), w, h: 20, text: '', stroke: '#fff' });
    d.text({ x: gx + 8, y: nt.y + (nt.label ? 18 : 24), text: nt.guard, size: 15, italic: true });
  }
  return bottom - y0;
}

function seqLoan() {
  const d = new Diagram('Подача заявки на кредит');
  const parts = [
    { key: 'cl', label: 'Клиент', actor: true }, { key: 'fm', label: ':LoanForm' }, { key: 'ct', label: ':LoanController' },
    { key: 'sc', label: ':ScoringService' }, { key: 'db', label: ':Database' }
  ];
  const steps = [
    call('cl', 'fm', 'fillForm()', [call('fm', 'ct', 'create()', [selfCall('ct', 'validate()')])]),
    { open: 'alt1', guard: '[данные некорректны]' },
    call('ct', 'fm', 'renderErrors()', [show('fm', 'cl', 'showErrors()')]),
    { close: true },
    { text: '[данные корректны]' },
    call('ct', 'sc', 'assess()', [call('sc', 'db', 'getHistory()', [], 'history')], 'decision'),
    { open: 'alt2', guard: '[отказ: нагрузка выше 40 % или вероятность дефолта выше 30 %]' },
    call('ct', 'db', 'saveApplication()', [], 'application'),
    call('ct', 'fm', 'renderRefusal()', [show('fm', 'cl', 'showRefusal()')]),
    { close: true },
    { text: '[иначе: заявка одобрена или передана на рассмотрение]' },
    call('ct', 'db', 'saveApplication()', [], 'application'),
    call('ct', 'fm', 'renderStatus()', [show('fm', 'cl', 'showStatus()')])
  ];
  sequencePanel(d, 20, 16, 'Подача заявки на кредит', parts, steps, 1100, 'ct');
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
  const d1 = dec(d, c1, 385, 'ДН выше\n40 %');
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
