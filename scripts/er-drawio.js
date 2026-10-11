// Строит ER-диаграмму draw.io по реальной базе данных PostgreSQL (information_schema).
// Использование: npm run er:drawio. Результат: docs/diagrams/er.drawio (по странице на модуль и общая схема).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Page, file } from './lib/drawio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Модуль таблицы определяется по SQL-файлу, в котором она создана
const MODULES = {
  '001_auth': 'Пользователи, клиенты, аудит', '002_ledger': 'Счета и проводки', '003_reference': 'Справочники',
  '004_transfers': 'Переводы', '005_deposits': 'Вклады', '006_loans': 'Кредиты', '007_cards': 'Карты', '008_payments': 'Платежи',
  '009_fraud': 'Антифрод', '016_security': 'Безопасность', '018_interbank': 'Межбанковские переводы', '023_mail': 'Почта', '024_scoring_model': 'Скоринг'
};
const moduleOf = new Map();
for (const f of readdirSync(path.join(root, 'db/sql')).sort()) {
  const key = f.replace('.sql', '');
  if (!MODULES[key]) continue;
  for (const m of readFileSync(path.join(root, 'db/sql', f), 'utf8').matchAll(/CREATE TABLE (\w+)/g)) moduleOf.set(m[1], MODULES[key]);
}

const { rows: cols } = await pool.query(`
  SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length AS len, c.numeric_precision AS prec, c.numeric_scale AS scale, c.is_nullable
  FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position`);
const { rows: pks } = await pool.query(`
  SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'`);
const { rows: fks } = await pool.query(`
  SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
await pool.end();

const SKIP = new Set(['schema_migrations', 'session']); // служебные таблицы
const tables = new Map();
for (const c of cols) {
  if (SKIP.has(c.table_name)) continue;
  if (!tables.has(c.table_name)) tables.set(c.table_name, []);
  const type = c.data_type === 'character varying' ? `varchar(${c.len})` : c.data_type === 'numeric' ? `numeric(${c.prec},${c.scale})` : c.data_type.replace('timestamp with time zone', 'timestamptz').replace('timestamp without time zone', 'timestamp');
  tables.get(c.table_name).push({ name: c.column_name, type, nullable: c.is_nullable === 'YES' });
}
const pkSet = new Set(pks.map((p) => `${p.table_name}.${p.column_name}`));
const fkMap = new Map(fks.map((f) => [`${f.table_name}.${f.column_name}`, f]));
const unique = [...new Set(fks.filter((f) => !SKIP.has(f.table_name) && !SKIP.has(f.ref_table)).map((f) => `${f.table_name}>${f.ref_table}`))].map((s) => s.split('>'));

const ROW = 20;
const WIDTH = 250;

/** Рисует таблицу; возвращает идентификатор и высоту. */
function drawTable(page, name, x, y, muted) {
  const rows = tables.get(name);
  const h = 28 + rows.length * ROW;
  const id = page.shape({
    value: name,
    style: `swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=${muted ? '#f5f5f5' : '#dae8fc'};strokeColor=${muted ? '#999999' : '#6c8ebf'};fontColor=${muted ? '#666666' : '#000000'};`,
    x, y, w: WIDTH, h
  });
  let cy = 28;
  for (const c of rows) {
    const key = `${name}.${c.name}`;
    const tag = pkSet.has(key) ? 'PK ' : fkMap.has(key) ? 'FK ' : '   ';
    page.shape({
      value: `${tag}${c.name} : ${c.type}${c.nullable ? '' : ' NOT NULL'}`.slice(0, 46),
      style: `text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;overflow=hidden;rotatable=0;whiteSpace=nowrap;fontSize=11;${pkSet.has(key) ? 'fontStyle=1;' : ''}${muted ? 'fontColor=#666666;' : ''}`,
      x: 0, y: cy, w: WIDTH, h: ROW, parent: id
    });
    cy += ROW;
  }
  return { id, h };
}

/** Страница: таблицы модуля и соседние таблицы из других модулей (серым). */
function modulePage(title, names) {
  const own = new Set(names);
  const neighbours = new Set();
  for (const f of fks) {
    if (own.has(f.table_name) && !own.has(f.ref_table)) neighbours.add(f.ref_table);
    if (own.has(f.ref_table) && !own.has(f.table_name)) neighbours.add(f.table_name);
  }
  const all = [...names, ...neighbours];
  const perRow = Math.max(2, Math.ceil(Math.sqrt(all.length * 1.4)));
  const page = new Page(title, { width: 1800, height: 1200 });
  const ids = new Map();
  let x = 40, y = 40, rowH = 0, col = 0;
  for (const n of all) {
    const t = drawTable(page, n, x, y, !own.has(n));
    ids.set(n, t.id);
    rowH = Math.max(rowH, t.h);
    x += WIDTH + 90;
    if (++col === perRow) { col = 0; x = 40; y += rowH + 70; rowH = 0; }
  }
  for (const [from, to] of unique) {
    if (ids.has(from) && ids.has(to) && (own.has(from) || own.has(to))) {
      page.edge({ source: ids.get(from), target: ids.get(to), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmandOne;startArrow=ERmany;endFill=0;startFill=0;' });
    }
  }
  return page;
}

const byModule = new Map();
for (const name of tables.keys()) {
  const m = moduleOf.get(name) ?? 'Прочее';
  if (!byModule.has(m)) byModule.set(m, []);
  byModule.get(m).push(name);
}
const pages = [...byModule.entries()].map(([m, names]) => modulePage(m, names));
// общая схема: все таблицы, связи только между ними
const overview = modulePage('Вся схема', [...tables.keys()]);
mkdirSync(path.join(root, 'docs/diagrams'), { recursive: true });
writeFileSync(path.join(root, 'docs/diagrams/er.drawio'), file([overview, ...pages]));
console.log(`ER-диаграмма: ${tables.size} таблиц, ${unique.length} связей, страниц: ${pages.length + 1}. Файл docs/diagrams/er.drawio`);
