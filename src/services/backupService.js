import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { config } from '../config/index.js';
import { AppError, BusinessError } from '../lib/errors.js';
import * as auditService from './auditService.js';

const run = promisify(execFile);

/*
 * Резервное копирование. Копия создаётся утилитой pg_dump в формате custom и сразу шифруется AES-256-GCM
 * тем же ключом DATA_KEY, что и персональные данные: файл копии без ключа прочитать нельзя.
 * Формат файла: 12 байт IV, шифртекст, 16 байт тега аутентификации.
 * Восстановление выполняет pg_restore в одной транзакции.
 */

const EXT = '.dump.enc';

function tool(name) {
  const bin = config.backup.pgBinDir;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return bin ? path.join(bin, exe) : exe;
}

/** Параметры подключения для утилит PostgreSQL: пароль передаётся через окружение, а не в командной строке. */
function connection() {
  const url = new URL(config.databaseUrl);
  const args = ['--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--dbname', url.pathname.slice(1)];
  return { args, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } };
}

async function runTool(name, args, env) {
  try {
    await run(tool(name), args, { env, maxBuffer: 1024 * 1024 * 20 });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new BusinessError(`Не найдена программа ${name}. Добавьте каталог bin установленного PostgreSQL в PATH или задайте PG_BIN_DIR в .env`);
    }
    throw new BusinessError(`Ошибка ${name}: ${String(error.stderr || error.message).trim().slice(0, 300)}`);
  }
}

async function encryptFile(source, target) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.dataKey, iv);
  const out = fs.createWriteStream(target);
  out.write(iv);
  await pipeline(fs.createReadStream(source), cipher, out, { end: false });
  out.write(cipher.getAuthTag());
  await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
}

async function decryptFile(source, target) {
  const { size } = await stat(source);
  if (size < 28) throw new BusinessError('Файл копии повреждён');
  const fd = fs.openSync(source, 'r');
  const iv = Buffer.alloc(12);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, iv, 0, 12, 0);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.dataKey, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(source, { start: 12, end: size - 17 }), decipher, fs.createWriteStream(target));
  } catch {
    throw new BusinessError('Не удалось расшифровать копию: файл повреждён или создан с другим ключом DATA_KEY');
  }
}

const dir = () => path.resolve(config.backup.dir);

/** Создаёт зашифрованную копию базы данных. @returns {Promise<{name:string, size:number}>} */
export async function createBackup(userId = null) {
  await mkdir(dir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `talerbank-${stamp}${EXT}`;
  const tmp = path.join(os.tmpdir(), `talerbank-${crypto.randomUUID()}.dump`);
  const { args, env } = connection();
  try {
    await runTool('pg_dump', [...args, '--format=custom', '--no-owner', '--file', tmp], env);
    await encryptFile(tmp, path.join(dir(), name));
  } finally {
    await rm(tmp, { force: true });
  }
  await pruneBackups();
  await auditService.log({ userId, action: 'backup.create', entity: 'backup', entityId: name });
  return { name, size: (await stat(path.join(dir(), name))).size };
}

/** Список копий, новые сверху. */
export async function listBackups() {
  let names = [];
  try {
    names = (await readdir(dir())).filter((n) => n.endsWith(EXT));
  } catch {
    return [];
  }
  const items = await Promise.all(names.map(async (name) => {
    const s = await stat(path.join(dir(), name));
    return { name, size: s.size, createdAt: s.mtime };
  }));
  return items.sort((a, b) => b.name.localeCompare(a.name));
}

/** Оставляет только последние N копий. */
export async function pruneBackups() {
  const all = await listBackups();
  for (const old of all.slice(config.backup.keep)) await rm(path.join(dir(), old.name), { force: true });
}

function safeName(name) {
  if (!/^talerbank-[\dT-]+\.dump\.enc$/.test(String(name))) throw new AppError('Некорректное имя копии', 400);
  return name;
}

/** Восстанавливает базу из копии. Текущие данные заменяются данными из копии. */
export async function restoreBackup(userId, name) {
  const file = path.join(dir(), safeName(name));
  if (!fs.existsSync(file)) throw new AppError('Копия не найдена', 404);
  const tmp = path.join(os.tmpdir(), `talerbank-${crypto.randomUUID()}.dump`);
  const { args, env } = connection();
  try {
    await decryptFile(file, tmp);
    await runTool('pg_restore', [...args, '--clean', '--if-exists', '--no-owner', '--single-transaction', tmp], env);
  } finally {
    await rm(tmp, { force: true });
  }
  await auditService.log({ userId, action: 'backup.restore', entity: 'backup', entityId: name });
}

/** Автоматическое копирование по расписанию. Вызывается один раз при запуске сервера. */
export function scheduleBackups(log = console) {
  const hours = config.backup.intervalHours;
  if (!hours || hours <= 0) return null;
  const timer = setInterval(() => {
    createBackup().then((b) => log.log(`Резервная копия создана: ${b.name}`)).catch((e) => log.error(`Резервное копирование не удалось: ${e.message}`));
  }, hours * 3600 * 1000);
  timer.unref();
  return timer;
}
