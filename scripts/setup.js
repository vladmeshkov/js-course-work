// Создаёт файл .env из .env.example и подставляет случайные ключи. Существующий .env не трогает.
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (existsSync(target)) {
  console.log('Файл .env уже есть, ничего не меняю.');
} else {
  const text = readFileSync(path.join(root, '.env.example'), 'utf8')
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`)
    .replace(/^DATA_KEY=.*$/m, `DATA_KEY=${crypto.randomBytes(32).toString('hex')}`);
  writeFileSync(target, text);
  console.log('Создан файл .env со случайными ключами.');
  console.log('Если пароль или имя базы данных другие, откройте .env и поправьте строку DATABASE_URL.');
}
