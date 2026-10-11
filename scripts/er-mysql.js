// Формирует SQL-файл в диалекте MySQL для диаграммы в MySQL Workbench (только главные таблицы, ключи и основные поля).
// Файл нужен только для рисования ER: рабочая база проекта остаётся в PostgreSQL.
// Использование: npm run er:mysql. Результат: docs/diagrams/er-workbench.sql
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Главные сущности предметной области в порядке создания (родители раньше детей)
const CORE = ['roles', 'users', 'clients', 'accounts', 'documents', 'postings', 'transfer_intents',
  'deposit_products', 'deposits', 'loan_products', 'loan_applications', 'loans', 'cards', 'payments'];
const EXTRA_COLUMNS = 4; // сколько обычных полей показывать помимо ключей

const { rows: cols } = await pool.query(`
  SELECT table_name, column_name, data_type, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position`, [CORE]);
const { rows: pks } = await pool.query(`
  SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND kcu.table_name = ANY($1)`, [CORE]);
const { rows: fks } = await pool.query(`
  SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND kcu.table_name = ANY($1)`, [CORE]);
await pool.end();

const pkSet = new Set(pks.map((p) => `${p.table_name}.${p.column_name}`));
const fkMap = new Map(fks.filter((f) => CORE.includes(f.ref_table)).map((f) => [`${f.table_name}.${f.column_name}`, f]));

function mysqlType(c) {
  switch (c.data_type) {
    case 'bigint': return 'BIGINT';
    case 'smallint': return 'SMALLINT';
    case 'integer': return 'INT';
    case 'boolean': return 'TINYINT(1)';
    case 'date': return 'DATE';
    case 'uuid': return 'CHAR(36)';
    case 'jsonb': return 'JSON';
    case 'numeric': return `DECIMAL(${c.prec},${c.scale})`;
    case 'character': return `CHAR(${c.len ?? 4})`;
    case 'character varying': return `VARCHAR(${c.len})`;
    case 'text': return 'VARCHAR(255)';
    default: return c.data_type.startsWith('timestamp') ? 'TIMESTAMP' : 'VARCHAR(255)';
  }
}

const out = [
  '-- ТалерБанк: учебная выжимка схемы для диаграммы в MySQL Workbench.',
  '-- Сформирована скриптом scripts/er-mysql.js из рабочей базы PostgreSQL: только главные таблицы, ключи и основные поля.',
  '-- Использовать только для построения ER-диаграммы. Полный скрипт рабочей базы: db/schema.sql.',
  '',
  'CREATE SCHEMA IF NOT EXISTS talerbank DEFAULT CHARACTER SET utf8mb4;',
  'USE talerbank;',
  ''
];
for (const t of CORE) {
  const all = cols.filter((c) => c.table_name === t);
  const keys = all.filter((c) => pkSet.has(`${t}.${c.column_name}`) || fkMap.has(`${t}.${c.column_name}`));
  const rest = all.filter((c) => !keys.includes(c) && !/_at$/.test(c.column_name)).slice(0, EXTRA_COLUMNS);
  const shown = all.filter((c) => keys.includes(c) || rest.includes(c));
  const lines = shown.map((c) => {
    const auto = pkSet.has(`${t}.${c.column_name}`) && /nextval/.test(c.column_default ?? '') ? ' AUTO_INCREMENT' : '';
    return `  \`${c.column_name}\` ${mysqlType(c)}${c.is_nullable === 'NO' ? ' NOT NULL' : ' NULL'}${auto}`;
  });
  const pkCols = shown.filter((c) => pkSet.has(`${t}.${c.column_name}`)).map((c) => `\`${c.column_name}\``);
  if (pkCols.length) lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
  for (const c of shown) {
    const f = fkMap.get(`${t}.${c.column_name}`);
    if (f) lines.push(`  CONSTRAINT \`fk_${t}_${c.column_name}\` FOREIGN KEY (\`${c.column_name}\`) REFERENCES \`${f.ref_table}\` (\`${f.ref_column}\`)`);
  }
  out.push(`CREATE TABLE \`${t}\` (\n${lines.join(',\n')}\n) ENGINE = InnoDB;`, '');
}
writeFileSync(path.join(root, 'docs/diagrams/er-workbench.sql'), out.join('\n'));
console.log(`Файл для MySQL Workbench: ${CORE.length} таблиц, docs/diagrams/er-workbench.sql`);
