// Собирает все SQL-файлы в один скрипт db/schema.sql (приложение к пояснительной записке).
// Скрипт можно выполнить целиком в MySQL Workbench или клиенте mysql на пустой базе. Тела триггеров (BEGIN ... END)
// клиенту нужно выполнять с другим разделителем команд, поэтому они оборачиваются в DELIMITER $$.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'db/sql');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let out = '-- ТалерБанк: полный скрипт создания базы данных (MySQL 8)\n-- Файл собирается командой npm run db:schema из db/sql/*.sql\n';
out += '-- Перед выполнением: CREATE DATABASE talerbank CHARACTER SET utf8mb4; USE talerbank;\n';
for (const file of files) {
  const sql = (await readFile(path.join(dir, file), 'utf8')).trim()
    .replace(/CREATE TRIGGER[\s\S]*?\nEND;/g, (block) => `DELIMITER $$\n${block.slice(0, -1)}$$\nDELIMITER ;`);
  out += `\n-- ${file}\n${sql}\n`;
}
await writeFile(path.join(root, 'db/schema.sql'), out);
console.log(`Собрано файлов: ${files.length}`);
