// Подбор раскладки диаграммы вариантов использования (рисунок 1.13): варианты расставляются случайным
// поиском (имитация отжига) так, чтобы эллипсы не налезали друг на друга и на рамки, линии не пересекали
// эллипсы и друг друга, включаемые и расширяющие варианты стояли рядом с базовыми, а сами варианты не
// выстраивались в ряды и колонки (как в учебных диаграммах, нарисованных вручную).
// Использование: node tools/uc-layout.js [seed]. Результат: docs/diagrams/uc-layout.json (его читает uml-views.js).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UC, ucSize } from './lib/uc-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let seed = Number(process.argv[2] ?? 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const { actors, cases, links, regions } = UC;
const items = cases.map((c) => ({ ...c, ...ucSize(c.text) }));
const byId = new Map(items.map((c) => [c.id, c]));
const actorPt = (a) => [a.cx + a.side * 22, a.cy];

// начальные позиции: случайные точки своей области
for (const c of items) {
  const r = regions[c.region];
  c.cx = r.x + c.rx + rnd() * Math.max(1, r.w - 2 * c.rx);
  c.cy = r.y + c.ry + rnd() * Math.max(1, r.h - 2 * c.ry);
}

const edge = (e, [tx, ty]) => { const dx = tx - e.cx, dy = ty - e.cy; const k = 1 / Math.hypot(dx / e.rx, dy / e.ry); return [e.cx + dx * k, e.cy + dy * k]; };
function segments() {
  const segs = [];
  for (const a of actors) for (const id of a.cases) { const e = byId.get(id); const p = actorPt(a); segs.push({ a: p, b: edge(e, p), ends: [id] }); }
  for (const [from, to] of links) { const f = byId.get(from), t = byId.get(to); segs.push({ a: edge(f, [t.cx, t.cy]), b: edge(t, [f.cx, f.cy]), ends: [from, to] }); }
  return segs;
}
const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
const cross = (s, t) => { const d1 = ccw(t.a, t.b, s.a), d2 = ccw(t.a, t.b, s.b), d3 = ccw(s.a, s.b, t.a), d4 = ccw(s.a, s.b, t.b); return d1 * d2 < 0 && d3 * d4 < 0; };
function segHitsEllipse(s, e, grow = 6) {
  const rx = e.rx + grow, ry = e.ry + grow;
  if (Math.max(s.a[0], s.b[0]) < e.cx - rx || Math.min(s.a[0], s.b[0]) > e.cx + rx || Math.max(s.a[1], s.b[1]) < e.cy - ry || Math.min(s.a[1], s.b[1]) > e.cy + ry) return false;
  for (let t = 0.02; t < 0.99; t += 0.03) {
    const x = s.a[0] + (s.b[0] - s.a[0]) * t, y = s.a[1] + (s.b[1] - s.a[1]) * t;
    if (((x - e.cx) / rx) ** 2 + ((y - e.cy) / ry) ** 2 < 1) return true;
  }
  return false;
}

function cost() {
  let c = 0;
  // эллипсы не пересекаются (с запасом) и стоят внутри своих областей
  for (let i = 0; i < items.length; i++) {
    const a = items[i], r = regions[a.region];
    const out = Math.max(0, r.x - (a.cx - a.rx)) + Math.max(0, (a.cx + a.rx) - (r.x + r.w)) + Math.max(0, r.y - (a.cy - a.ry)) + Math.max(0, (a.cy + a.ry) - (r.y + r.h));
    c += out * 40;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const dx = (a.cx - b.cx) / (a.rx + b.rx + 40), dy = (a.cy - b.cy) / (a.ry + b.ry + 30);
      const d = Math.hypot(dx, dy);
      if (d < 1) c += (1 - d) * 4000;
      // ровные ряды и колонки выглядят как шаблон
      if (Math.abs(a.cx - b.cx) < 12 && Math.abs(a.cy - b.cy) < 260) c += 25;
      if (Math.abs(a.cy - b.cy) < 8 && Math.abs(a.cx - b.cx) < 420) c += 25;
    }
  }
  const segs = segments();
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (const e of items) if (!s.ends.includes(e.id) && segHitsEllipse(s, e)) c += 900;
    for (let j = i + 1; j < segs.length; j++) if (cross(s, segs[j])) c += 500;
  }
  // включаемые и расширяющие варианты рядом с базовыми, ассоциации не слишком длинные
  for (const [from, to] of links) {
    const f = byId.get(from), t = byId.get(to); const L = Math.hypot(f.cx - t.cx, f.cy - t.cy); c += Math.max(0, L - 330) * 1.2;
    // между связанными эллипсами место под подпись «include»/«extend», и подпись не ложится на другие эллипсы
    const p = edge(f, [t.cx, t.cy]), q = edge(t, [f.cx, f.cy]), gap = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (gap < 80) c += (80 - gap) * 30;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    for (const e of items) if (((mx - e.cx) / (e.rx + 30)) ** 2 + ((my - e.cy) / (e.ry + 14)) ** 2 < 1) c += 400;
  }
  for (const a of actors) for (const id of a.cases) { const e = byId.get(id); c += Math.hypot(e.cx - a.cx, e.cy - a.cy) * 0.15; }
  // иерархия: включаемый или расширяющий вариант дальше от актёра, чем базовый
  for (const [from, to, kind] of links) {
    const base = byId.get(kind === 'include' ? from : to), dep = byId.get(kind === 'include' ? to : from);
    const act = actors.find((x) => x.cases.includes(base.id));
    if (!act) continue;
    const d0 = Math.hypot(base.cx - act.cx, base.cy - act.cy), d1 = Math.hypot(dep.cx - act.cx, dep.cy - act.cy);
    c += Math.max(0, d0 + 150 - d1) * 4;
  }
  return c;
}

let cur = cost(), best = cur, bestPos = items.map((c) => [c.cx, c.cy]);
const N = Number(process.env.N ?? 250000);
for (let k = 0; k < N; k++) {
  const T = 400 * (1 - k / N) + 0.5;
  const c = items[Math.floor(rnd() * items.length)];
  const ox = c.cx, oy = c.cy, step = 15 + 160 * (1 - k / N);
  c.cx += (rnd() - 0.5) * 2 * step; c.cy += (rnd() - 0.5) * 2 * step;
  const nc = cost();
  if (nc < cur || rnd() < Math.exp((cur - nc) / T)) {
    cur = nc;
    if (cur < best) { best = cur; bestPos = items.map((x) => [x.cx, x.cy]); }
  } else { c.cx = ox; c.cy = oy; }
}
items.forEach((c, i) => { [c.cx, c.cy] = bestPos[i]; });
const out = Object.fromEntries(items.map((c) => [c.id, [Math.round(c.cx), Math.round(c.cy)]]));
writeFileSync(path.join(root, 'docs/diagrams/uc-layout.json'), JSON.stringify(out, null, 1));
// проверка: пересечения линий и линий с эллипсами
let cr = 0, hit = 0; const sg = segments();
for (let i = 0; i < sg.length; i++) { for (const e of items) if (!sg[i].ends.includes(e.id) && segHitsEllipse(sg[i], e, 0)) hit++; for (let j = i + 1; j < sg.length; j++) if (cross(sg[i], sg[j])) cr++; }
console.log('штраф', Math.round(best), 'пересечений', cr, 'через эллипсы', hit);
