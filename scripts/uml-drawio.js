// Строит UML-диаграммы draw.io: классы (по исходному коду), варианты использования, последовательности.
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

const pascal = (s) => s.replace(/\.js$/, '').replace(/^./, (c) => c.toUpperCase());

function scan(dir, stereotype) {
  const base = path.join(root, 'src', dir);
  return readdirSync(base).filter((f) => f.endsWith('.js')).sort().map((f) => {
    const text = readFileSync(path.join(base, f), 'utf8');
    const methods = [...text.matchAll(/^export (?:async )?function (\w+)\(([^)]*)\)/gm)].map((m) => `+ ${m[1]}(${simplifyParams(m[2])})`);
    const consts = [...text.matchAll(/^export const (\w+)\s*=\s*(?:async\s*)?\(?/gm)].map((m) => `+ ${m[1]}()`);
    const deps = [...text.matchAll(/from '\.\.?\/(?:\.\.\/)?(controllers|services|models|lib)\/(\w+)\.js'|from '\.\/(\w+)\.js'/g)]
      .map((m) => (m[1] ? { layer: m[1], name: m[2] } : { layer: dir, name: m[3] }));
    return { name: pascal(f), file: f.replace('.js', ''), stereotype, methods: [...methods, ...consts], deps };
  });
}

const controllers = scan('controllers', 'controller');
const services = scan('services', 'service');
const models = scan('models', 'model');
const libs = scan('lib', 'library');

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

/* ---------- Диаграмма вариантов использования ---------- */

{
  const page = new Page('Варианты использования', { width: 2000, height: 1500 });
  const actors = {
    guest: ['Гость', 40, 60], client: ['Клиент', 40, 760], operator: ['Операционист', 1740, 120],
    credit: ['Кредитный специалист', 1740, 420], monitor: ['Специалист по мониторингу', 1740, 700], admin: ['Администратор', 1740, 1000]
  };
  const a = {};
  for (const [k, [name, x, y]] of Object.entries(actors)) a[k] = page.shape({ value: name, style: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontStyle=1;', x, y, w: 40, h: 80 });
  page.shape({ value: 'ТалерБанк: дистанционное банковское обслуживание', style: 'rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;verticalAlign=top;fontStyle=1;fontSize=14;', x: 200, y: 20, w: 1500, h: 1500 });

  const groups = [
    ['guest', 240, 60, ['Просмотр курсов и конвертер', 'Калькулятор вкладов', 'Калькулятор кредитов', 'Регистрация и подача анкеты', 'Вход в систему']],
    ['client', 240, 460, ['Открытие и закрытие счёта', 'Выписка и справка по счёту (PDF)', 'Перевод между своими счетами с конвертацией', 'Перевод клиенту банка', 'Перевод в другой банк', 'Оплата услуг по каталогу', 'Шаблоны платежей и автоплатежи', 'Оформление вклада', 'Досрочное закрытие вклада', 'Заявка на кредит и подписание договора', 'Погашение кредита', 'Выпуск, блокировка карты, лимиты', 'Настройка двухфакторной защиты', 'Просмотр уведомлений']],
    ['operator', 1020, 60, ['Проверка анкеты клиента', 'Взнос и выдача наличных', 'Регистрация входящего платежа', 'Блокировка счёта клиента']],
    ['credit', 1020, 360, ['Рассмотрение заявки на кредит', 'Решение: одобрить или отказать']],
    ['monitor', 1020, 560, ['Проверка задержанного перевода', 'Просмотр операций особого контроля']],
    ['admin', 1020, 780, ['Управление курсами и тарифами', 'Управление пользователями и ролями', 'Просмотр журнала аудита', 'Резервное копирование и восстановление', 'Формирование отчётов и ОСВ', 'Закрытие операционного дня', 'Просмотр клиринга']]
  ];
  const cases = {};
  for (const [actor, x, y, names] of groups) {
    const cols = actor === 'client' ? 2 : 1;
    names.forEach((n, i) => {
      const cx = x + (i % cols) * 360;
      const cy = y + Math.floor(i / cols) * (actor === 'client' ? 90 : 70);
      const id = page.shape({ value: n, style: 'ellipse;whiteSpace=wrap;html=1;fontSize=11;fillColor=#fff2cc;strokeColor=#d6b656;', x: cx, y: cy, w: 300, h: 56 });
      cases[`${actor}:${n}`] = id;
      page.edge({ source: a[actor], target: id, style: 'endArrow=none;html=1;' });
    });
  }
  // клиент наследует возможности гостя
  page.edge({ source: a.client, target: a.guest, style: 'endArrow=block;endFill=0;html=1;', value: '' });
  // включения и расширения
  const link = (from, to, label) => page.edge({ source: cases[from], target: cases[to], value: label, style: 'endArrow=open;dashed=1;html=1;fontSize=10;' });
  link('client:Перевод клиенту банка', 'client:Перевод в другой банк', '');
  link('client:Заявка на кредит и подписание договора', 'credit:Рассмотрение заявки на кредит', '<<extend>>');
  link('client:Перевод клиенту банка', 'monitor:Проверка задержанного перевода', '<<extend>>');
  link('guest:Регистрация и подача анкеты', 'operator:Проверка анкеты клиента', '<<include>>');
  save('usecases.drawio', [page]);
}

/* ---------- Диаграммы последовательности ---------- */

function sequence(name, lifelines, messages) {
  const gap = 190;
  const page = new Page(name, { width: lifelines.length * gap + 200, height: 200 + messages.length * 50 + 100 });
  const x = (i) => 80 + i * gap;
  const height = 120 + messages.length * 46;
  lifelines.forEach((l, i) => page.shape({
    value: l, style: 'shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fontStyle=1;',
    x: x(i) - 60, y: 40, w: 120, h: height
  }));
  messages.forEach(([from, to, text, kind], i) => {
    const y = 130 + i * 46;
    const fx = x(from), tx = x(to);
    if (from === to) {
      page.line({ from: [fx, y], to: [fx, y + 22], value: text, points: [[fx + 55, y], [fx + 55, y + 22]], style: 'html=1;endArrow=block;fontSize=10;align=left;verticalAlign=middle;labelPosition=right;verticalLabelPosition=middle;' });
    } else {
      const reply = kind === 'reply';
      page.line({ from: [fx, y], to: [tx, y], value: text, style: `html=1;verticalAlign=bottom;endArrow=${reply ? 'open' : 'block'};${reply ? 'dashed=1;' : ''}fontSize=10;` });
    }
  });
  return page;
}

const transfer = sequence('Перевод клиенту банка',
  ['Клиент', 'TransferController', 'TransferService', 'FraudService', 'OtpService', 'MailService', 'LedgerService', 'PostgreSQL'],
  [
    [0, 1, 'POST /transfers (счёт, IBAN, сумма)'],
    [1, 2, 'createTransfer(userId, input)'],
    [2, 7, 'проверка счетов, суточного лимита'],
    [2, 3, 'evaluate(контекст перевода)'],
    [3, 2, 'балл риска и решение', 'reply'],
    [2, 7, 'INSERT transfer_intents'],
    [2, 4, 'issue(userId, purpose)'],
    [4, 2, 'код', 'reply'],
    [1, 5, 'sendCode(userId, код)'],
    [5, 0, 'письмо с кодом на email', 'reply'],
    [1, 0, 'страница подтверждения', 'reply'],
    [0, 1, 'POST /transfers/:id/confirm (код)'],
    [1, 2, 'confirmTransfer(userId, id, код)'],
    [2, 4, 'verify(userId, purpose, код)'],
    [2, 6, 'post(проводки) в транзакции'],
    [6, 7, 'блокировка счетов, INSERT postings'],
    [2, 7, 'confirmed, уведомление, аудит'],
    [1, 0, 'перевод выполнен', 'reply']
  ]);

const loan = sequence('Заявка на кредит',
  ['Клиент', 'LoanController', 'LoanService', 'ScoringService', 'Кредитный специалист', 'LedgerService', 'PostgreSQL'],
  [
    [0, 1, 'POST /loans (сумма, срок, доход, ...)'],
    [1, 2, 'apply(userId, input)'],
    [2, 2, 'график платежей, долговая нагрузка'],
    [2, 3, 'assess(модель, заявка)'],
    [3, 2, 'вероятность дефолта, решение', 'reply'],
    [2, 6, 'INSERT loan_applications (статус)'],
    [1, 0, 'одобрена / на рассмотрении / отказ', 'reply'],
    [4, 2, 'decide(approve, комментарий) для ручной заявки'],
    [0, 1, 'POST /applications/:id/sign (код)'],
    [1, 2, 'sign(userId, id, код)'],
    [2, 5, 'post(выдача кредита)'],
    [5, 6, 'проводки, график платежей'],
    [2, 0, 'кредит выдан, деньги на счёте', 'reply']
  ]);

const eod = sequence('Закрытие операционного дня',
  ['Администратор', 'AdminController', 'EodService', 'DepositService', 'LoanService', 'PaymentService', 'InterbankService', 'PostgreSQL'],
  [
    [0, 1, 'POST /admin/eod (дней)'],
    [1, 2, 'closeDays(userId, days)'],
    [2, 7, 'BEGIN, сдвиг банковской даты'],
    [2, 3, 'processDeposits(db, дата)'],
    [3, 7, 'проценты, закрытие по сроку'],
    [2, 4, 'processLoans(db, дата)'],
    [4, 7, 'платежи, просрочка, пеня'],
    [2, 5, 'processAutopayments(db, дата)'],
    [2, 4, 'sendReminders(db, дата)'],
    [2, 6, 'processClearing(db, дата)'],
    [6, 7, 'пакет платежей, проводки'],
    [2, 7, 'контроль двойной записи, COMMIT'],
    [1, 0, 'итоги закрытия дня', 'reply']
  ]);
save('sequence.drawio', [transfer, loan, eod]);

console.log(`Классы: ${controllers.length} контроллеров, ${services.length} сервисов, ${models.length} моделей, ${libs.length} библиотек. Файлы в docs/diagrams`);
