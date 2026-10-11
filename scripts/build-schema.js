// Собирает все SQL-файлы в один скрипт db/schema.sql (приложение к пояснительной записке).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'db/sql');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let out = '-- ТалерБанк: полный скрипт создания базы данных (PostgreSQL 16)\n-- Файл собирается командой npm run db:schema из db/sql/*.sql\n';
for (const file of files) {
  out += `\n-- ${file}\n${(await readFile(path.join(dir, file), 'utf8')).trim()}\n`;
}
await writeFile(path.join(root, 'db/schema.sql'), out);
console.log(`Собрано файлов: ${files.length}`);
