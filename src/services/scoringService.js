import { query } from '../db/pool.js';
import { FEATURES, featuresOf, predict, train, evaluate, syntheticHistory } from '../lib/regression.js';
import * as settingsModel from '../models/settingsModel.js';

/*
 * Регрессионный скоринг заявок. Активная модель хранится в таблице scoring_models. Если модели нет
 * (база только что создана), заявки оценивает балльная карта из lib/scoring.js.
 */

export async function activeModel(db = { query }) {
  const { rows } = await db.query('SELECT version, coefficients, metrics, samples, created_at FROM scoring_models WHERE active');
  return rows[0] ?? null;
}

/**
 * Обучает новую модель на синтетической истории, проверяет её на отложенной выборке и делает активной.
 * @returns {Promise<{version:number, metrics:object}>}
 */
export async function trainAndActivate({ samples = 6000, seed = 2026 } = {}) {
  const { x, y } = syntheticHistory(samples, seed);
  const cut = Math.floor(samples * 0.8);
  const model = train(x.slice(0, cut), y.slice(0, cut));
  const metrics = evaluate(model, x.slice(cut), y.slice(cut), 0.15);
  const { rows: [last] } = await query('SELECT COALESCE(max(version), 0) AS v FROM scoring_models');
  const version = last.v + 1;
  await query('UPDATE scoring_models SET active = false WHERE active');
  await query('INSERT INTO scoring_models (version, coefficients, metrics, samples, active) VALUES ($1, $2, $3, $4, true)',
    [version, JSON.stringify(model), JSON.stringify(metrics), samples]);
  return { version, metrics, model };
}

/** Создаёт модель, если её ещё нет (начальная настройка). */
export async function ensureModel() {
  return (await activeModel()) ? null : trainAndActivate();
}

const pct = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * Оценка заявки моделью. Решение: нагрузка выше предела: отказ; PD не выше порога автоодобрения и сумма до лимита: одобрение;
 * PD не выше порога ручного рассмотрения: ручное рассмотрение; иначе отказ.
 * @param {{coefficients:object, version:number}} model
 * @param {{age:number, income:number, dti:number, experienceMonths:number, dependents:number, amount:number}} application
 * @param {{maxDti:number, autoLimit:number}} limits
 */
export async function assess(model, application, limits) {
  const features = featuresOf(application);
  const { pd, contributions } = predict(model.coefficients, features);
  const pdApprove = await settingsModel.getNumber('loan.pd_approve');
  const pdManual = await settingsModel.getNumber('loan.pd_manual');
  const pdPercent = pd * 100;

  const notes = [{ factor: 'Вероятность дефолта', points: Math.round(pdPercent * 10) / 10, text: `${pct(pdPercent)} % (порог одобрения ${pdApprove} %, рассмотрения ${pdManual} %), модель версии ${model.version}` }];
  const shown = (key, v) => ({ age: `${Math.round(v)} лет`, incomeLog: `${Math.round(Math.exp(v))} BYN в месяц`, dti: `${pct(v)} %`, experienceYears: `${pct(v)} лет`, dependents: `${Math.round(v)}`, loanToIncome: `${pct(v * 100)} % годового дохода` })[key];
  FEATURES.forEach((f, j) => {
    // вклад признака в PD: разница между вероятностью с реальным значением и со средним значением признака
    const without = predict(model.coefficients, features.map((v, k) => (k === j ? model.coefficients.mean[j] : v))).pd;
    const delta = (pd - without) * 100;
    notes.push({ factor: f.label, points: Math.round(delta * 10) / 10, text: shown(f.key, features[j]) });
  });

  let decision;
  if (application.dti > limits.maxDti) decision = 'reject';
  else if (pdPercent <= pdApprove && application.amount <= limits.autoLimit) decision = 'approve';
  else if (pdPercent <= pdManual) decision = 'manual';
  else decision = 'reject';
  return { score: Math.max(0, Math.min(100, Math.round(100 - pdPercent))), dti: Math.round(application.dti * 100) / 100, decision, notes, pdPercent: Math.round(pdPercent * 100) / 100, modelVersion: model.version };
}
