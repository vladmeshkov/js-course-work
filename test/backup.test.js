import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { createBackup, listBackups, restoreBackup } from '../src/services/backupService.js';
import { closePool } from './helpers.js';

let dir;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'taler-backup-'));
  config.backup.dir = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe('резервное копирование', () => {
  it('создаёт зашифрованную копию, которая восстанавливает базу', async () => {
    await pool.query("INSERT INTO settings (`key`, value, description) VALUES ('test.marker', 'до копии', 'тест') ON DUPLICATE KEY UPDATE value = 'до копии'");
    const { name, size } = await createBackup();
    expect(size).toBeGreaterThan(1000);
    const raw = await readFile(path.join(dir, name));
    // дамп mysqldump начинается с «-- MySQL dump»: после шифрования этого заголовка в файле быть не должно
    expect(raw.subarray(0, 8).toString()).not.toBe('-- MySQL');
    expect(raw.includes(Buffer.from('CREATE TABLE'))).toBe(false);
    expect(raw.includes(Buffer.from('до копии'))).toBe(false);
    expect((await listBackups()).map((b) => b.name)).toContain(name);

    await pool.query("UPDATE settings SET value = 'после копии' WHERE `key` = 'test.marker'");
    await restoreBackup(null, name);
    const { rows } = await pool.query("SELECT value FROM settings WHERE `key` = 'test.marker'");
    expect(rows[0].value).toBe('до копии');
    await pool.query("DELETE FROM settings WHERE `key` = 'test.marker'");
  });

  it('обнаруживает повреждённый файл и неверное имя', async () => {
    const { name } = await createBackup();
    const file = path.join(dir, name);
    const raw = await readFile(file);
    raw[200] ^= 0xff;
    await (await import('node:fs/promises')).writeFile(file, raw);
    await expect(restoreBackup(null, name)).rejects.toThrow(/расшифровать/);
    await expect(restoreBackup(null, '../../etc/passwd')).rejects.toThrow(/Некорректное имя/);
  });

  it('хранит только заданное число копий', async () => {
    const before = config.backup.keep;
    config.backup.keep = 2;
    try {
      for (let i = 0; i < 3; i++) {
        await createBackup();
        await new Promise((r) => setTimeout(r, 1100));
      }
      expect((await readdir(dir)).length).toBe(2);
    } finally {
      config.backup.keep = before;
    }
  }, 20000);
});
