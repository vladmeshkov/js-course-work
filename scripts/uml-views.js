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
/** groups: [{actor, cases:[текст]}], shared: [{text, from:[[группа, номер]...], label}] */
function useCases(name, system, groups, shared = []) {
  const d = new Diagram(name);
  const rx = 160; const ry = 30; const pitch = 84;
  const frameX = 170; const cx = frameX + 30 + rx;
  let y = 70;
  const caseEll = [];
  groups.forEach((g, gi) => {
    caseEll[gi] = g.cases.map((text, k) => ({ cx, cy: y + ry + k * pitch, rx, ry, text }));
    const top = caseEll[gi][0].cy; const bottom = caseEll[gi].at(-1).cy;
    g.mid = (top + bottom) / 2;
    y = bottom + ry + 34;
  });
  const bottomY = y - 34 + 24;
  const cx2 = cx + rx + 90 + 110;
  const frameW = (shared.length ? cx2 + 110 + 24 : cx + rx + 24) - frameX;
  d.frame({ x: frameX, y: 30, w: frameW, h: bottomY - 30, title: system, center: true });
  groups.forEach((g, gi) => {
    const ax = 72;
    d.actor({ cx: ax, y: g.mid - 37, name: g.actor });
    caseEll[gi].forEach((e) => {
      d.line({ pts: [[ax + 16, g.mid], [e.cx - e.rx * 0.97, e.cy + (e.cy < g.mid ? 6 : e.cy > g.mid ? -6 : 0)]], arrow: null });
    });
  });
  groups.forEach((g, gi) => caseEll[gi].forEach((e) => d.ellipse(e)));
  shared.forEach((s, si) => {
    const srcs = s.from.map(([gi, k]) => caseEll[gi][k]);
    const sy = s.cy ?? (srcs.reduce((a, e) => a + e.cy, 0) / srcs.length);
    const e = { cx: cx2, cy: sy, rx: 110, ry: 30, text: s.text };
    d.ellipse(e);
    srcs.forEach((src) => d.line({ pts: [[src.cx + src.rx, src.cy], [e.cx - e.rx * 0.95, e.cy + (src.cy < e.cy ? -8 : src.cy > e.cy ? 8 : 0)]], dashed: true, arrow: 'open', label: s.label ?? '«include»', at: { x: (src.cx + src.rx + e.cx - e.rx) / 2, y: (src.cy + e.cy) / 2 - 8 } }));
    void si;
  });
  return d;
}

const ucGuest = useCases('Гость', 'Система ТалерБанк', [{ actor: 'Гость', cases: ['Просмотр курсов валют\nи конвертер', 'Расчёт вклада\nи кредита', 'Просмотр сведений\nо банке', 'Регистрация\n(подача анкеты)'] }]);
const ucClient1 = useCases('Клиент: счета, переводы, платежи', 'Система ТалерБанк', [{ actor: 'Клиент', cases: [
  'Вход в систему', 'Открытие и закрытие счёта', 'Просмотр выписки\nи справки (PDF)', 'Перевод между\nсвоими счетами', 'Перевод клиенту банка',
  'Перевод в другой банк', 'Оплата услуг по каталогу', 'Шаблоны платежей\nи автоплатежи'] }],
[{ text: 'Подтверждение\nкодом', from: [[0, 4], [0, 5]] }]);
const ucClient2 = useCases('Клиент: вклады, кредиты, карты', 'Система ТалерБанк', [{ actor: 'Клиент', cases: [
  'Оформление вклада', 'Досрочное закрытие вклада', 'Подача заявки на кредит', 'Подписание договора\nи получение кредита', 'Погашение кредита',
  'Выпуск карты', 'Блокировка карты\nи настройка лимитов', 'Настройка двухфакторной\nзащиты и уведомлений'] }],
[{ text: 'Скоринг заявки', from: [[0, 2]] }, { text: 'Подтверждение\nкодом', from: [[0, 3]] }]);
const ucStaff = useCases('Сотрудники банка', 'Система ТалерБанк', [
  { actor: 'Операционист', cases: ['Проверка анкет клиентов', 'Касса: приём и выдача\nналичных', 'Регистрация входящих\nмежбанковских платежей', 'Блокировка счетов'] },
  { actor: 'Кредитный\nспециалист', cases: ['Рассмотрение заявки\nна кредит'] },
  { actor: 'Специалист по\nмониторингу', cases: ['Разбор задержанных\nпереводов', 'Контроль операций\nособого контроля'] }
]);
const ucAdmin = useCases('Администратор', 'Система ТалерБанк', [{ actor: 'Администратор', cases: [
  'Управление курсами\nи спредом', 'Настройка тарифов\nи лимитов', 'Управление пользователями\nи ролями', 'Просмотр журнала аудита',
  'Резервное копирование\nи восстановление', 'Отчёты и оборотно-\nсальдовая ведомость', 'Закрытие операционного дня', 'Управление клирингом'] }]);

/* =====================  Диаграммы последовательности  ===================== */
/** steps: {m:[от, до, текст, 'ret'|'self']} | {alt:'условие'} | {els:'условие'} | {end:true} */
function sequence(name, names, steps, pitch = 150) {
  const d = new Diagram(name);
  const x0 = 30; const headW = pitch - 24; const headY = 20; const headH = names.some((n) => n.includes('\n')) ? 48 : 34;
  const cx = (i) => x0 + headW / 2 + i * pitch;
  const lifeTop = headY + headH;
  let y = lifeTop + 46;
  const out = [];
  const frames = [];
  const stack = [];
  for (const s of steps) {
    if (s.alt) { stack.push({ y: y - 22, parts: [{ y: y - 22, text: s.alt }] }); y += 14; continue; }
    if (s.els) { stack.at(-1).parts.push({ y: y - 20, text: s.els }); y += 18; continue; }
    if (s.end) { const f = stack.pop(); f.bottom = y - 10; frames.push(f); y += 16; continue; }
    const [a, b, text, kind] = s.m;
    const nl = text.split('\n').length;
    y += (nl - 1) * 19;
    out.push({ a, b, text, kind, y });
    y += kind === 'self' ? 62 : 50;
  }
  const bottom = y;
  const fx = x0 - 14; const fw = (names.length - 1) * pitch + headW + 28;
  for (const f of frames) {
    d.frame({ x: fx, y: f.y, w: fw, h: f.bottom - f.y, stroke: '#000', dashed: false });
    d.rect({ x: fx, y: f.y, w: 44, h: 22, text: 'alt', size: 14, bold: true });
    f.parts.forEach((p, k) => {
      d.text({ x: fx + 54, y: p.y + 16, text: p.text, size: 15, italic: true, bold: false });
      if (k > 0) d.line({ pts: [[fx, p.y - 4], [fx + fw, p.y - 4]], arrow: null, dashed: true });
    });
  }
  names.forEach((n, i) => {
    d.rect({ x: cx(i) - headW / 2, y: headY, w: headW, h: headH, text: n, bold: true });
    d.line({ pts: [[cx(i), lifeTop], [cx(i), bottom]], arrow: null, dashed: true });
  });
  for (const m of out) {
    const nl = m.text.split('\n').length;
    if (m.kind === 'self') {
      const x = cx(m.a);
      d.line({ pts: [[x, m.y], [x + 46, m.y], [x + 46, m.y + 26], [x, m.y + 26]], arrow: 'filled', label: m.text, at: { x: x + 54, y: m.y + 14 - (nl - 1) * 9, anchor: 'start' }, italic: false });
    } else {
      const xa = cx(m.a) + (m.b > m.a ? 4 : -4); const xb = cx(m.b) + (m.b > m.a ? -4 : 4);
      d.line({ pts: [[xa, m.y], [xb, m.y]], arrow: m.kind === 'ret' ? 'open' : 'filled', dashed: m.kind === 'ret', label: m.text, at: { x: (xa + xb) / 2, y: m.y - 7 - (nl - 1) * 19 }, italic: false });
    }
  }
  return d;
}

const seqTransfer = sequence('Перевод клиенту банка',
  ['Клиент', 'Transfer-\nController', 'Transfer-\nService', 'Fraud-\nService', 'Otp-\nService', 'Ledger-\nService'], [
    { m: [0, 1, 'Форма перевода:\nсчёт, IBAN, сумма'] },
    { m: [1, 2, 'createTransfer()'] },
    { m: [2, 2, 'Проверка счетов, IBAN,\nлимита и комиссии', 'self'] },
    { m: [2, 3, 'evaluate()'] },
    { m: [3, 2, 'решение, балл риска', 'ret'] },
    { alt: '[решение «задержать»]' },
    { m: [2, 2, 'Резерв суммы, случай\nдля специалиста', 'self'] },
    { m: [2, 1, 'перевод на проверке', 'ret'] },
    { els: '[нужен код подтверждения]' },
    { m: [2, 4, 'issue()'] },
    { m: [4, 2, 'код (письмом)', 'ret'] },
    { m: [2, 1, 'заявка ждёт кода', 'ret'] },
    { m: [1, 0, 'Форма ввода кода', 'ret'] },
    { m: [0, 1, 'Код из письма'] },
    { m: [1, 2, 'confirmTransfer()'] },
    { m: [2, 4, 'verify()'] },
    { m: [4, 2, 'код верный', 'ret'] },
    { end: true },
    { m: [2, 5, 'post(проводки)'] },
    { m: [5, 2, 'документ проведён', 'ret'] },
    { m: [2, 1, 'перевод выполнен', 'ret'] },
    { m: [1, 0, 'Квитанция', 'ret'] }
  ]);

const seqLoan = sequence('Заявка на кредит',
  ['Клиент', 'Loan-\nController', 'Loan-\nService', 'Scoring-\nService', 'Кредитный\nспециалист', 'Otp-\nService', 'Ledger-\nService'], [
    { m: [0, 1, 'Заявка: сумма,\nсрок, доход'] },
    { m: [1, 2, 'apply()'] },
    { m: [2, 2, 'График платежей,\nдолговая нагрузка', 'self'] },
    { m: [2, 3, 'assess()'] },
    { m: [3, 2, 'вероятность дефолта', 'ret'] },
    { alt: '[вероятность дефолта до 8 %]' },
    { m: [2, 1, 'заявка одобрена', 'ret'] },
    { els: '[до 30 %: ручное рассмотрение]' },
    { m: [2, 4, 'заявка в очереди'] },
    { m: [4, 2, 'decide(одобрить)', 'ret'] },
    { els: '[выше порога]' },
    { m: [2, 1, 'отказ по заявке', 'ret'] },
    { end: true },
    { m: [0, 1, 'Подписать договор'] },
    { m: [1, 2, 'requestSignCode()'] },
    { m: [2, 5, 'issue()'] },
    { m: [5, 2, 'код (письмом)', 'ret'] },
    { m: [0, 1, 'Код из письма'] },
    { m: [1, 2, 'sign()'] },
    { m: [2, 5, 'verify()'] },
    { m: [2, 6, 'post(выдача кредита)'] },
    { m: [2, 1, 'кредит выдан', 'ret'] },
    { m: [1, 0, 'Деньги на счёте', 'ret'] }
  ], 138);

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

function actTransfer() {
  const d = new Diagram('Перевод клиенту банка');
  const W = 960; const H = 1130;
  const C = lanes(d, ['Клиент', 'Система', 'Специалист по мониторингу'], W, H);
  const c0 = C(0); const c1 = C(1); const c2 = C(2);
  d.mark({ kind: 'start', cx: c0, cy: 110 });
  const a1 = act(d, c0, 175, 'Ввод счёта списания,\nIBAN получателя и суммы');
  arrow(d, [[c0, 120], [c0, a1.y]]);
  const a2 = act(d, c1, 275, 'Проверка счетов, IBAN\n(mod 97), лимита, комиссии', 250);
  arrow(d, [Rt(a1), [c1, 175], [c1, a2.y]]);
  const d1 = dec(d, c1, 385, 'Данные\nверны?');
  arrow(d, [B(a2), [c1, d1.y]]);
  const e1 = act(d, c0, 385, 'Сообщение об ошибке,\nисправление данных', 230);
  arrow(d, [Lf(d1), Rt(e1)], 'нет', { x: (d1.x + e1.x + e1.w) / 2, y: 378 });
  arrow(d, [T(e1), B(a1)]);
  const a3 = act(d, c1, 500, 'Оценка риска перевода\n(антифрод)', 250);
  arrow(d, [B(d1), T(a3)], 'да', { x: c1 + 8, y: 456, anchor: 'start' });
  const d2 = dec(d, c1, 625, 'Решение\nантифрода', 210, 100);
  arrow(d, [B(a3), T(d2)]);
  const a4 = act(d, c0, 625, 'Ввод кода подтверждения\nиз письма', 230);
  arrow(d, [Lf(d2), Rt(a4)], 'нужен код', { x: (d2.x + a4.x + a4.w) / 2, y: 618 });
  const a5 = act(d, c2, 625, 'Анализ случая\nи решение', 220);
  arrow(d, [Rt(d2), Lf(a5)], 'задержать', { x: (d2.x + d2.w + a5.x) / 2, y: 618 });
  const a6 = act(d, c1, 880, 'Проводка двойной записью\n(одна транзакция)', 260);
  arrow(d, [B(d2), T(a6)], 'без кода', { x: c1 + 8, y: 730, anchor: 'start' });
  arrow(d, [B(a4), [c0, a6.y + 23], Lf(a6)], 'код проверяется\nсистемой', { x: c0 + 8, y: 790, anchor: 'start' });
  const d4 = dec(d, c2, 760, 'Одобрить?', 170, 80);
  arrow(d, [B(a5), T(d4)]);
  arrow(d, [Lf(d4), [c1 + 175, 760], [c1 + 175, a6.y + 23], Rt(a6)], 'да', { x: (c1 + 175 + d4.x) / 2, y: 752 });
  d.mark({ kind: 'end', cx: c2, cy: 880 });
  arrow(d, [B(d4), [c2, 870]], 'нет: резерв снимается,\nклиент уведомляется', { x: c2 + 8, y: 826, anchor: 'start' });
  const a7 = act(d, c1, 985, 'Уведомление клиента,\nквитанция', 230);
  arrow(d, [B(a6), T(a7)]);
  d.mark({ kind: 'end', cx: c1, cy: 1070 });
  arrow(d, [B(a7), [c1, 1060]]);
  return d;
}

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
  arrow(d, [Rt(d2), Lf(a5)], 'до 30 %', { x: (d2.x + d2.w + a5.x) / 2, y: 618 });
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

function stTransfer() {
  const d = new Diagram('Состояния заявки на перевод');
  d.mark({ kind: 'start', cx: 50, cy: 300 });
  const nw = st(d, 140, 160, 'new\nсоздана, ждёт кода', 200);
  const rv = st(d, 140, 410, 'review\nзадержана, на проверке', 200);
  const cn = st(d, 660, 80, 'cancelled\nотменена клиентом', 200);
  const ex = st(d, 660, 160, 'expired\nистёк срок кода', 200);
  const cf = st(d, 660, 270, 'confirmed\nвыполнена', 200);
  const rj = st(d, 660, 425, 'rejected\nотклонена специалистом', 230);
  d.line({ pts: [[60, 296], [100, 296], [100, 190], [140, 190]], label: 'создание', at: { x: 94, y: 240, anchor: 'end' } });
  d.line({ pts: [[60, 304], [100, 304], [100, 440], [140, 440]], label: 'антифрод:\nзадержать', at: { x: 94, y: 372, anchor: 'end' } });
  d.line({ pts: [[340, 172], [450, 172], [450, 110], [660, 110]], label: 'клиент отменил', at: { x: 555, y: 102 } });
  d.line({ pts: [[340, 190], [660, 190]], label: 'срок истёк', at: { x: 580, y: 182 } });
  d.line({ pts: [[340, 208], [500, 208], [500, 285], [660, 285]], label: 'верный код\nили без кода', at: { x: 580, y: 250 } });
  d.line({ pts: [[340, 425], [450, 425], [450, 315], [660, 315]], label: 'специалист\nодобрил', at: { x: 555, y: 351 } });
  d.line({ pts: [[340, 455], [660, 455]], label: 'специалист отклонил', at: { x: 500, y: 447 } });
  d.mark({ kind: 'end', cx: 960, cy: 300 });
  for (const s of [cn, ex, rj]) d.line({ pts: [[s.x + s.w, s.y + s.h / 2], [960, s.y + s.h / 2], [960, s.y + s.h / 2 < 300 ? 290 : 310]], arrow: null });
  d.line({ pts: [[cf.x + cf.w, 300], [950, 300]] });
  void nw; void rv;
  return d;
}

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

function stLoanPayment() {
  const d = new Diagram('Состояния кредита и платежа по графику');
  d.frame({ x: 20, y: 20, w: 330, h: 330, title: 'Кредит (loans)' });
  d.mark({ kind: 'start', cx: 185, cy: 90 });
  const ac = st(d, 90, 130, 'active\nдействует', 190);
  const cl = st(d, 90, 250, 'closed\nпогашен', 190);
  d.line({ pts: [[185, 100], [185, 130]] });
  d.line({ pts: [[185, 190], [185, 250]], label: 'полное погашение', at: { x: 193, y: 225, anchor: 'start' } });
  d.frame({ x: 400, y: 20, w: 560, h: 330, title: 'Платёж по графику (loan_schedule)' });
  d.mark({ kind: 'start', cx: 440, cy: 130 });
  const pl = st(d, 480, 100, 'planned\nзапланирован', 190);
  const ov = st(d, 480, 250, 'overdue\nпросрочен', 190);
  const pd = st(d, 790, 100, 'paid\nоплачен', 150);
  d.line({ pts: [[450, 130], [480, 130]] });
  d.line({ pts: [[670, 130], [790, 130]], label: 'оплачен\nв срок', at: { x: 730, y: 94 } });
  d.line({ pts: [[575, 160], [575, 250]], label: 'срок прошёл,\nоплаты нет', at: { x: 583, y: 200, anchor: 'start' } });
  d.line({ pts: [[670, 280], [865, 280], [865, 160]], label: 'погашен с пеней', at: { x: 770, y: 272 } });
  return d;
}

function stDepositCard() {
  const d = new Diagram('Состояния вклада и карты');
  d.frame({ x: 20, y: 20, w: 540, h: 360, title: 'Вклад (deposits)' });
  d.mark({ kind: 'start', cx: 55, cy: 200 });
  st(d, 150, 170, 'active\nдействует', 160);
  st(d, 400, 90, 'closed\nзакрыт по сроку', 150);
  st(d, 400, 270, 'early_closed\nзакрыт досрочно', 150);
  d.line({ pts: [[65, 200], [150, 200]], label: 'открытие', at: { x: 107, y: 192 } });
  d.line({ pts: [[310, 188], [355, 188], [355, 120], [400, 120]], label: 'срок\nистёк', at: { x: 348, y: 160, anchor: 'end' } });
  d.line({ pts: [[310, 212], [355, 212], [355, 300], [400, 300]], label: 'досрочное\nзакрытие', at: { x: 348, y: 256, anchor: 'end' } });
  d.frame({ x: 600, y: 20, w: 540, h: 360, title: 'Карта (cards)' });
  d.mark({ kind: 'start', cx: 640, cy: 120 });
  st(d, 700, 90, 'active\nдействует', 160);
  st(d, 700, 270, 'blocked\nзаблокирована', 160);
  st(d, 950, 175, 'closed\nзакрыта', 140);
  d.line({ pts: [[650, 120], [700, 120]], label: 'выпуск', at: { x: 675, y: 110 } });
  d.line({ pts: [[740, 150], [740, 270]], label: 'блокировка', at: { x: 732, y: 215, anchor: 'end' } });
  d.line({ pts: [[820, 270], [820, 150]], label: 'разблокировка', at: { x: 828, y: 215, anchor: 'start' } });
  d.line({ pts: [[860, 120], [1020, 120], [1020, 175]], label: 'закрытие', at: { x: 940, y: 112 } });
  d.line({ pts: [[860, 300], [1020, 300], [1020, 235]], label: 'закрытие', at: { x: 940, y: 292 } });
  return d;
}

/* =====================  Компоненты и развёртывание  ===================== */
function components() {
  const d = new Diagram('Диаграмма компонентов');
  d.frame({ x: 20, y: 20, w: 250, h: 330, title: 'Браузер клиента', center: true });
  const pg = d.component({ x: 60, y: 80, w: 170, h: 60, text: 'Страницы HTML,\nCSS (одна таблица)' });
  const js = d.component({ x: 60, y: 170, w: 170, h: 60, text: 'Клиентский\nJavaScript' });
  void js;
  d.frame({ x: 340, y: 20, w: 560, h: 560, title: 'Сервер приложения (Node.js, Express 5)', center: true });
  const mw = d.component({ x: 400, y: 80, w: 200, h: 50, text: 'Промежуточные слои:\nсессии, CSRF, права, 2FA' });
  const rt = d.component({ x: 650, y: 80, w: 200, h: 50, text: 'Маршруты (routes)' });
  const ct = d.component({ x: 650, y: 170, w: 200, h: 50, text: 'Контроллеры' });
  const vw = d.component({ x: 400, y: 170, w: 200, h: 50, text: 'Представления (EJS)' });
  const sv = d.component({ x: 650, y: 260, w: 200, h: 60, text: 'Сервисы:\nбизнес-логика' });
  const lb = d.component({ x: 400, y: 260, w: 200, h: 60, text: 'Библиотеки: деньги,\nIBAN, TOTP, PDF' });
  const md = d.component({ x: 650, y: 360, w: 200, h: 50, text: 'Модели (SQL-запросы)' });
  const jb = d.component({ x: 400, y: 440, w: 200, h: 60, text: 'Фоновые задачи: копии,\nочередь писем' });
  void mw;
  d.frame({ x: 970, y: 330, w: 250, h: 150, title: 'PostgreSQL 16', center: true });
  const db = d.component({ x: 1010, y: 380, w: 170, h: 70, text: 'Таблицы, триггеры,\nсессии' });
  d.frame({ x: 970, y: 20, w: 250, h: 120, title: 'Национальный банк', center: true });
  const nb = d.component({ x: 1010, y: 70, w: 170, h: 50, text: 'API курсов\napi.nbrb.by' });
  d.frame({ x: 970, y: 170, w: 250, h: 120, title: 'Почтовый сервер', center: true });
  const sm = d.component({ x: 1010, y: 220, w: 170, h: 50, text: 'SMTP' });
  d.frame({ x: 970, y: 510, w: 250, h: 100, title: 'Хранилище копий', center: true });
  const bk = d.component({ x: 1010, y: 550, w: 170, h: 40, text: 'Файлы (AES-256-GCM)' });
  d.line({ pts: [Rt(pg), [310, pg.y + 30], [310, mw.y + 25], Lf(mw)], label: 'HTTPS', at: { x: 295, y: 70 }, arrow: 'open' });
  d.line({ pts: [Rt(mw), Lf(rt)], arrow: 'open' });
  d.line({ pts: [B(rt), T(ct)], arrow: 'open' });
  d.line({ pts: [Lf(ct), Rt(vw)], arrow: 'open' });
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
  const app = d.node({ x: 400, y: 80, w: 300, h: 230, title: '«server» Сервер приложения', text: 'Обратный прокси (nginx, Caddy)\nс сертификатом TLS\n\nNode.js 20+, Express 5\nприложение ТалерБанк' });
  const db = d.node({ x: 830, y: 120, w: 240, h: 150, title: '«server» Сервер БД', text: 'PostgreSQL 16\nбаза talerbank' });
  const mail = d.node({ x: 400, y: 430, w: 300, h: 100, title: '«server» Почтовый сервер', text: 'SMTP (коды и уведомления)' });
  const nb = d.node({ x: 30, y: 430, w: 280, h: 100, title: '«server» Нацбанк', text: 'api.nbrb.by (курсы валют)' });
  const bk = d.node({ x: 830, y: 430, w: 240, h: 100, title: '«device» Хранилище', text: 'Резервные копии\n(шифрование AES-256-GCM)' });
  d.line({ pts: [[pc.x + pc.w + 16, 200], [app.x, 200]], arrow: null, label: 'HTTPS', at: { x: 343, y: 192 } });
  d.line({ pts: [[app.x + app.w + 16, 200], [db.x, 200]], arrow: null, label: 'TCP 5432 (SQL)', at: { x: 770, y: 192 } });
  d.line({ pts: [[app.x + 150, app.y + app.h], [app.x + 150, mail.y - 14]], arrow: null, label: 'SMTP', at: { x: app.x + 158, y: 385, anchor: 'start' } });
  d.line({ pts: [[app.x + 40, app.y + app.h], [app.x + 40, 380], [170, 380], [170, nb.y - 14]], arrow: null, label: 'HTTPS (JSON)', at: { x: 255, y: 372 } });
  d.line({ pts: [[app.x + 260, app.y + app.h], [app.x + 260, 380], [950, 380], [950, bk.y - 14]], arrow: null, label: 'файлы копий', at: { x: 810, y: 372 } });
  void textWidth; void FS; void mid; void B; void T;
  return d;
}

const pages = [
  ['uc-guest', ucGuest], ['uc-client-1', ucClient1], ['uc-client-2', ucClient2], ['uc-staff', ucStaff], ['uc-admin', ucAdmin],
  ['seq-transfer', seqTransfer], ['seq-loan', seqLoan],
  ['act-transfer', actTransfer()], ['act-loan', actLoan()],
  ['st-transfer', stTransfer()], ['st-loan', stLoanApp()], ['st-loan-payment', stLoanPayment()], ['st-deposit-card', stDepositCard()],
  ['components', components()], ['deployment', deployment()]
];
writeFileSync(path.join(outDir, 'views.drawio'), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map(([, p]) => p.drawio()).join('')}</mxfile>\n`);
for (const [n, p] of pages) writeFileSync(path.join(outDir, `view-${n}.svg`), p.svg());
console.log(`Модели представления: docs/diagrams/views.drawio и ${pages.length} SVG`);
