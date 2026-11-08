// Строит ER-диаграмму draw.io по реальной базе данных MySQL (information_schema).
// Использование: npm run er:drawio. Результат: docs/diagrams/er.drawio (по странице на модуль и общая схема).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { Page, file } from './lib/drawio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = await mysql.createPool({ uri: process.env.DATABASE_URL, decimalNumbers: true });

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

const [cols] = await pool.query(`
  SELECT c.table_name AS table_name, c.column_name AS column_name, c.column_type AS column_type, c.is_nullable AS is_nullable
  FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
  WHERE c.table_schema = DATABASE() AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position`);
const [pks] = await pool.query(`
  SELECT table_name AS table_name, column_name AS column_name FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE() AND constraint_name = 'PRIMARY'`);
const [fks] = await pool.query(`
  SELECT table_name AS table_name, column_name AS column_name, referenced_table_name AS ref_table, referenced_column_name AS ref_column
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL`);
await pool.end();

const SKIP = new Set(['schema_migrations', 'sessions', 'account_number_seq']); // служебные таблицы
const tables = new Map();
for (const c of cols) {
  if (SKIP.has(c.table_name)) continue;
  if (!tables.has(c.table_name)) tables.set(c.table_name, []);
  tables.get(c.table_name).push({ name: c.column_name, type: c.column_type, nullable: c.is_nullable === 'YES' });
}
const pkSet = new Set(pks.map((p) => `${p.table_name}.${p.column_name}`));
const fkMap = new Map(fks.map((f) => [`${f.table_name}.${f.column_name}`, f]));
const unique = [...new Set(fks.filter((f) => !SKIP.has(f.table_name) && !SKIP.has(f.ref_table)).map((f) => `${f.table_name}>${f.ref_table}`))].map((s) => s.split('>'));
// допустим ли пустой внешний ключ: тогда на стороне «многие» рисуется «ноль или много»
const nullableLink = (from, to) => fks.filter((f) => f.table_name === from && f.ref_table === to).every((f) => tables.get(from)?.find((c) => c.name === f.column_name)?.nullable);

const ROW = 22;
const WIDTH = 250;
const HEADER = 30;

/** Тип в записи, привычной по MySQL Workbench. */
const shortType = (t) => t.toUpperCase().replace(/ UNSIGNED/, ' UNSIGNED');

/**
 * Таблица в стиле MySQL Workbench: синий заголовок, значки столбцов (жёлтый ромб PK, красный FK,
 * синий обычный, пустой для необязательного), серая полоса Indexes внизу.
 */
function drawTable(page, name, x, y, muted, rowsOverride) {
  const rows = rowsOverride ?? tables.get(name);
  const h = HEADER + rows.length * ROW + 22;
  const stroke = muted ? '#9A9A9A' : '#4F81B0';
  const id = page.shape({
    value: name,
    style: `swimlane;fontStyle=1;fontSize=13;childLayout=stackLayout;horizontal=1;startSize=${HEADER};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;rounded=1;arcSize=6;fillColor=#F4F8FC;swimlaneFillColor=#F4F8FC;gradientColor=${muted ? '#B5B5B5' : '#7FAEDB'};strokeColor=${stroke};fontColor=#FFFFFF;align=center;`,
    x, y, w: WIDTH, h
  });
  let cy = HEADER;
  for (const c of rows) {
    const key = `${name}.${c.name}`;
    const pk = pkSet.has(key);
    const fk = fkMap.has(key);
    const color = muted ? '#B0B0B0' : pk ? '#F2C12E' : fk ? '#C0504D' : '#5BA7D6';
    page.shape({
      value: '', style: `rhombus;fillColor=${!pk && !fk && c.nullable ? '#FFFFFF' : color};strokeColor=${muted ? '#808080' : pk ? '#A07B00' : fk ? '#8E2E2B' : '#2F76A3'};`,
      x: 8, y: cy + 6, w: 10, h: 10, parent: id
    });
    page.shape({
      value: `${c.name} ${shortType(c.type)}`.slice(0, 40),
      style: `text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=24;overflow=hidden;rotatable=0;whiteSpace=nowrap;fontSize=11;${pk ? 'fontStyle=1;' : ''}${muted ? 'fontColor=#707070;' : ''}`,
      x: 0, y: cy, w: WIDTH, h: ROW, parent: id
    });
    cy += ROW;
  }
  page.shape({ value: 'Indexes', style: 'text;strokeColor=none;fillColor=#BDBDBD;fontColor=#FFFFFF;fontStyle=1;fontSize=11;align=left;verticalAlign=middle;spacingLeft=10;rotatable=0;', x: 0, y: cy, w: WIDTH, h: 22, parent: id });
  return { id, h };
}

/** Связь: пунктир, «вилка» на стороне внешнего ключа, прямые углы. */
function link(page, from, to, ids) {
  const optional = nullableLink(from, to);
  page.edge({
    source: ids.get(from), target: ids.get(to),
    style: `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;dashed=1;dashPattern=8 4;strokeColor=#333333;startArrow=${optional ? 'ERzeroToMany' : 'ERoneToMany'};endArrow=ERmandOne;startSize=10;endSize=10;startFill=0;endFill=0;`
  });
}

/** Раскладывает таблицы по сетке рядов. */
function place(page, grid, { gapX = 110, gapY = 70, rowsOf = (n) => tables.get(n), muted = () => false } = {}) {
  const ids = new Map();
  let y = 40;
  for (const line of grid) {
    let rowH = 0;
    line.forEach((name, c) => {
      if (!name) return;
      const t = drawTable(page, name, 40 + c * (WIDTH + gapX), y, muted(name), rowsOf(name));
      ids.set(name, t.id);
      rowH = Math.max(rowH, t.h);
    });
    y += rowH + gapY;
  }
  return ids;
}

/** Страница модуля: таблицы модуля и соседние таблицы других модулей (серым). */
function modulePage(title, names) {
  const own = new Set(names);
  const neighbours = new Set();
  for (const f of fks) {
    if (SKIP.has(f.table_name) || SKIP.has(f.ref_table)) continue;
    if (own.has(f.table_name) && !own.has(f.ref_table)) neighbours.add(f.ref_table);
    if (own.has(f.ref_table) && !own.has(f.table_name)) neighbours.add(f.table_name);
  }
  const all = [...names, ...neighbours];
  const perRow = Math.max(2, Math.ceil(Math.sqrt(all.length * 1.2)));
  const grid = [];
  for (let i = 0; i < all.length; i += perRow) grid.push(all.slice(i, i + perRow));
  const page = new Page(title, { width: 1800, height: 1400 });
  const ids = place(page, grid, { muted: (n) => !own.has(n) });
  for (const [from, to] of unique) if (ids.has(from) && ids.has(to) && (own.has(from) || own.has(to))) link(page, from, to, ids);
  return page;
}

/** Общая схема для записки: главные сущности, у каждой ключи и несколько ключевых полей. */
function corePage() {
  const grid = [
    ['roles', 'users', 'currencies', 'payment_providers', 'interbank_transfers'],
    ['audit_log', 'clients', 'accounts', 'payments', 'documents'],
    ['deposit_products', 'deposits', 'cards', 'postings', 'transfer_intents'],
    ['loan_products', 'loan_applications', 'loans', null, 'fraud_cases']
  ];
  const chosen = new Set(grid.flat().filter(Boolean));
  const keyOf = (name) => (col) => pkSet.has(`${name}.${col.name}`) || (fkMap.has(`${name}.${col.name}`) && chosen.has(fkMap.get(`${name}.${col.name}`).ref_table) && fkMap.get(`${name}.${col.name}`).ref_table !== 'users');
  const rowsOf = (name) => {
    const all = tables.get(name);
    const keys = all.filter(keyOf(name));
    const rest = all.filter((c) => !keyOf(name)(c) && !fkMap.has(`${name}.${c.name}`) && !/^(created_at|updated_at)$/.test(c.name)).slice(0, 3);
    return [...keys, ...rest];
  };
  const page = new Page('Основные сущности (для записки)', { width: 1800, height: 1500 });
  const ids = place(page, grid, { rowsOf });
  // связи «кто инициировал» с таблицей users не показаны: они загромоздили бы схему
  for (const [from, to] of unique) if (ids.has(from) && ids.has(to) && to !== 'users') link(page, from, to, ids);
  link(page, 'users', 'roles', ids);
  link(page, 'clients', 'users', ids);
  link(page, 'audit_log', 'users', ids);
  page.shape({ value: 'Связи с таблицей users от остальных таблиц (кто выполнил операцию) не показаны', style: 'text;fontSize=11;fontStyle=2;fontColor=#666666;', x: 40, y: 0, w: 600, h: 24 });
  return page;
}

const byModule = new Map();
for (const name of tables.keys()) {
  const m = moduleOf.get(name) ?? 'Прочее';
  if (!byModule.has(m)) byModule.set(m, []);
  byModule.get(m).push(name);
}
const pages = [...byModule.entries()].map(([m, names]) => modulePage(m, names));
mkdirSync(path.join(root, 'docs/diagrams'), { recursive: true });
writeFileSync(path.join(root, 'docs/diagrams/er.drawio'), file([corePage(), ...pages]));
console.log(`ER-диаграмма: ${tables.size} таблиц, ${unique.length} связей, страниц: ${pages.length + 1}. Файл docs/diagrams/er.drawio`);
