import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { syntheticHistory, train, evaluate, predict, featuresOf, FEATURES } from '../src/lib/regression.js';
import * as scoringService from '../src/services/scoringService.js';
import { apply } from '../src/services/loanService.js';
import { createClientWithAccount, closePool } from './helpers.js';

const limits = { maxDti: 40, autoLimit: 500000 };
const good = { age: 30, income: 240000, dti: 22, experienceMonths: 60, dependents: 0, amount: 1500000 };
const middle = { age: 28, income: 180000, dti: 30, experienceMonths: 18, dependents: 1, amount: 1200000 };
const weak = { age: 20, income: 90000, dti: 38, experienceMonths: 3, dependents: 2, amount: 2000000 };

let model;
beforeAll(async () => {
  await pool.query('UPDATE scoring_models SET active = false');
  model = (await scoringService.trainAndActivate({ samples: 4000 })).model;
});
afterAll(async () => {
  await pool.query('UPDATE scoring_models SET active = false');
  await closePool();
});

describe('логистическая регрессия', () => {
  it('генератор истории воспроизводим, модель восстанавливает знаки зависимостей', () => {
    const a = syntheticHistory(500, 7);
    const b = syntheticHistory(500, 7);
    expect(a.y).toEqual(b.y);
    const w = Object.fromEntries(FEATURES.map((f, i) => [f.key, model.weights[i]]));
    expect(w.dti).toBeGreaterThan(0);
    expect(w.dependents).toBeGreaterThan(0);
    expect(w.experienceYears).toBeLessThan(0);
    expect(w.incomeLog).toBeLessThan(0);
  });

  it('качество на отложенной выборке выше случайного угадывания', () => {
    const { x, y } = syntheticHistory(3000, 99);
    const m = evaluate(model, x, y, 0.15);
    expect(m.auc).toBeGreaterThan(0.7);
    expect(m.ks).toBeGreaterThan(0.3);
    expect(m.accuracy).toBeGreaterThan(0.8);
  });

  it('вероятность в пределах от 0 до 1 и растёт вместе с долговой нагрузкой', () => {
    const low = predict(model, featuresOf({ ...good, dti: 10 })).pd;
    const high = predict(model, featuresOf({ ...good, dti: 60 })).pd;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(1);
    expect(high).toBeGreaterThan(low);
  });

  it('обучение на одинаковых данных даёт одинаковую модель', () => {
    const { x, y } = syntheticHistory(1000, 5);
    expect(train(x, y).weights).toEqual(train(x, y).weights);
  });
});

describe('решение по модели', () => {
  const active = async () => scoringService.activeModel();

  it('надёжный заёмщик одобряется, средний уходит специалисту, слабый получает отказ', async () => {
    const m = await active();
    const ok = await scoringService.assess(m, { ...good, amount: 400000 }, limits);
    const mid = await scoringService.assess(m, middle, limits);
    const bad = await scoringService.assess(m, weak, limits);
    expect(ok.decision).toBe('approve');
    expect(mid.decision).toBe('manual');
    expect(bad.decision).toBe('reject');
    expect(ok.pdPercent).toBeLessThan(mid.pdPercent);
    expect(mid.pdPercent).toBeLessThan(bad.pdPercent);
  });

  it('сумма выше лимита автоодобрения не одобряется автоматически, нагрузка выше предела даёт отказ', async () => {
    const m = await active();
    expect((await scoringService.assess(m, { ...good, amount: 900000 }, limits)).decision).toBe('manual');
    expect((await scoringService.assess(m, { ...good, dti: 55 }, limits)).decision).toBe('reject');
  });

  it('вклады признаков объясняют решение: есть вероятность и по строке на каждый признак', async () => {
    const r = await scoringService.assess(await active(), middle, limits);
    expect(r.notes).toHaveLength(1 + FEATURES.length);
    expect(r.notes[0].factor).toBe('Вероятность дефолта');
    expect(r.score).toBe(Math.round(100 - r.pdPercent));
  });

  it('заявка на кредит сохраняет вероятность дефолта и версию модели; без модели работает балльная карта', async () => {
    const c = await createClientWithAccount(0);
    await pool.query("UPDATE clients SET birth_date = '1990-05-05' WHERE id = $1", [c.clientId]);
    const productId = (await pool.query("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'")).rows[0].id;
    const request = { productId, amount: 300000, termMonths: 12, scheduleType: 'annuity', targetAccountId: c.accountId, income: 300000, obligations: 0, experienceMonths: 60, dependents: 0 };
    const withModel = await apply(c.userId, request);
    expect(withModel.status).toBe('approved');
    expect(Number(withModel.pd_percent)).toBeGreaterThan(0);
    expect(withModel.model_version).toBe((await active()).version);

    await pool.query('UPDATE scoring_models SET active = false');
    const card = await apply(c.userId, request);
    expect(card.pd_percent).toBeNull();
    expect(card.model_version).toBeNull();
  });
});
