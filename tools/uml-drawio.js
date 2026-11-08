// Строит диаграммы классов draw.io по исходному коду (контроллеры, сервисы, модели, библиотеки).
// Использование: npm run uml:drawio. Результат: docs/diagrams/*.drawio
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, file } from './lib/drawio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/diagrams');
mkdirSync(out, { recursive: true });
const save = (name, pages) => writeFileSync(path.join(out, name), file(pages));

/* ---------- Диаграммы классов по коду ---------- */

/** Короткая запись параметров: имена без значений по умолчанию, объект параметров как options. */
function simplifyParams(raw) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => { const t = p.trim(); return t.startsWith('{') ? 'options' : t.startsWith('[') ? 'list' : t.split('=')[0].trim(); }).join(', ');
}

const pascal = (s) => s.replace(/\.js$/, '').replace(/(^|[.-])(\w)/g, (_, __, c) => c.toUpperCase());

/** Все файлы кода сервера: server/modules/<модуль>/* и server/shared/*, кроме маршрутов. */
function serverFiles() {
  const out = [];
  const modules = path.join(root, 'server/modules');
  for (const m of readdirSync(modules)) {
    for (const f of readdirSync(path.join(modules, m))) if (f.endsWith('.js') && f !== 'routes.js') out.push({ file: path.join(modules, m, f), name: f });
  }
  for (const f of readdirSync(path.join(root, 'server/shared'))) if (f.endsWith('.js')) out.push({ file: path.join(root, 'server/shared', f), name: f });
  return out;
}

/** Файлы одного вида: controller, service, model или library (всё остальное). */
function scan(kind, stereotype) {
  const kindOf = (name) => (/\.(controller|service|model)\.js$/.exec(name)?.[1] ?? 'library');
  return serverFiles().filter((f) => kindOf(f.name) === kind).sort((a, b) => a.name.localeCompare(b.name)).map(({ file, name }) => {
    const text = readFileSync(file, 'utf8');
    const methods = [...text.matchAll(/^export (?:async )?function (\w+)\(([^)]*)\)/gm)].map((m) => `+ ${m[1]}(${simplifyParams(m[2])})`);
    const consts = [...text.matchAll(/^export const (\w+)\s*=\s*(?:async\s*)?\(?/gm)].map((m) => `+ ${m[1]}()`);
    const deps = [...text.matchAll(/from '\.{1,2}\/(?:[\w-]+\/)*([\w-]+)\.(controller|service|model)\.js'|from '\.\/([\w-]+)\.js'/g)]
      .map((m) => (m[2] ? { layer: `${m[2]}s`, name: m[1] } : { layer: 'lib', name: m[3] }));
    const base = name.replace(/\.js$/, '').replace(/\.(controller|service|model)$/, '');
    return { name: pascal(name), file: base, stereotype, methods: [...methods, ...consts], deps };
  });
}

const controllers = scan('controller', 'controller');
const services = scan('service', 'service');
const models = scan('model', 'model');
const libs = scan('library', 'library');

/** Раскладывает классы по сетке. Возвращает идентификаторы по ключу. */
function layout(page, items, { x0 = 40, y0 = 40, perRow = 5, w = 250, gapX = 70, gapY = 50, maxMethods = 10, fill = '#ffffff' } = {}) {
  const ids = new Map();
  let x = x0, y = y0, rowH = 0, col = 0;
  for (const c of items) {
    const shown = c.methods.slice(0, maxMethods);
    if (c.methods.length > maxMethods) shown.push(`… ещё ${c.methods.length - maxMethods}`);
    const r = page.umlClass({ name: c.name, stereotype: c.stereotype, methods: shown, x, y, w, fill });
    ids.set(`${c.stereotype}:${c.file}`, r.id);
    rowH = Math.max(rowH, r.h);
    x += w + gapX;
    if (++col === perRow) { col = 0; x = x0; y += rowH + gapY; rowH = 0; }
  }
  return ids;
}

const dep = 'endArrow=open;endSize=10;dashed=1;html=1;edgeStyle=orthogonalEdgeStyle;';

// 1. Бизнес-логика: сервисы и зависимости между ними
{
  const page = new Page('Сервисы бизнес-логики', { width: 2000, height: 1800 });
  const ids = layout(page, services, { perRow: 5, fill: '#d5e8d4' });
  // сквозные сервисы (аудит, уведомления) используют почти все: их связи не рисуем, иначе схема нечитаема
  const popular = new Set(['auditService', 'notificationService']);
  page.shape({ value: 'Связи с AuditService и NotificationService (их вызывают почти все сервисы) не показаны', style: 'text;html=0;fontSize=12;fontStyle=2;', x: 40, y: 0, w: 700, h: 30 });
  for (const s of services) {
    for (const d of s.deps) {
      if (d.layer === 'services' && ids.has(`service:${d.name}`) && d.name !== s.file && !popular.has(d.name)) {
        page.edge({ source: ids.get(`service:${s.file}`), target: ids.get(`service:${d.name}`), style: dep });
      }
    }
  }
  var servicesPage = page;
}

// 2. Слои MVC: контроллеры, сервисы, модели (только имена и методы-обзор)
{
  const page = new Page('Слои приложения', { width: 2000, height: 2400 });
  const c = layout(page, controllers, { x0: 40, perRow: 1, w: 260, maxMethods: 4, fill: '#dae8fc', gapY: 24 });
  const s = layout(page, services, { x0: 460, perRow: 1, w: 260, maxMethods: 3, fill: '#d5e8d4', gapY: 24 });
  const m = layout(page, models, { x0: 880, perRow: 1, w: 260, maxMethods: 3, fill: '#fff2cc', gapY: 24 });
  for (const ctl of controllers) for (const d of ctl.deps) if (d.layer === 'services' && s.has(`service:${d.name}`)) page.edge({ source: c.get(`controller:${ctl.file}`), target: s.get(`service:${d.name}`), style: dep });
  for (const svc of services) for (const d of svc.deps) if (d.layer === 'models' && m.has(`model:${d.name}`)) page.edge({ source: s.get(`service:${svc.file}`), target: m.get(`model:${d.name}`), style: dep });
  var layersPage = page;
}

// 3. Модели доступа к данным
{
  const page = new Page('Модели (доступ к БД)', { width: 1800, height: 1400 });
  layout(page, models, { perRow: 4, fill: '#fff2cc' });
  var modelsPage = page;
}

// 4. Вспомогательные библиотеки
{
  const page = new Page('Библиотеки', { width: 1800, height: 1400 });
  layout(page, libs, { perRow: 4, fill: '#e1d5e7' });
  var libsPage = page;
}

save('classes.drawio', [layersPage, servicesPage, modelsPage, libsPage]);
