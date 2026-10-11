/*
 * Логистическая регрессия для кредитного скоринга: вероятность дефолта заёмщика (PD).
 * Модель: PD = 1 / (1 + exp(-(b + sum(w_i * z_i)))), где z_i = (x_i - mean_i) / std_i, x_i: признаки заявки.
 * Обучение: градиентный спуск с L2-регуляризацией. Всё на чистом JavaScript, без внешних библиотек.
 */

/** Признаки заявки в порядке, в котором их ждёт модель. */
export const FEATURES = [
  { key: 'age', label: 'Возраст', unit: 'лет' },
  { key: 'incomeLog', label: 'Доход', unit: 'BYN в месяц' },
  { key: 'dti', label: 'Долговая нагрузка', unit: '%' },
  { key: 'experienceYears', label: 'Стаж', unit: 'лет' },
  { key: 'dependents', label: 'Иждивенцы', unit: 'чел.' },
  { key: 'loanToIncome', label: 'Сумма к годовому доходу', unit: 'раз' }
];

/**
 * Вектор признаков из данных заявки (деньги в копейках).
 * @param {{age:number, income:number, dti:number, experienceMonths:number, dependents:number, amount:number}} a
 */
export function featuresOf(a) {
  const incomeByn = Math.max(a.income / 100, 1);
  return [
    Math.min(Math.max(a.age, 18), 80),
    Math.log(incomeByn),
    Math.min(Math.max(a.dti, 0), 150),
    Math.min(a.experienceMonths / 12, 10),
    Math.min(a.dependents, 6),
    Math.min(a.amount / (a.income * 12), 6)
  ];
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Среднее и стандартное отклонение каждого признака. */
function standardizer(rows) {
  const n = rows.length;
  const mean = FEATURES.map((_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const std = FEATURES.map((_, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n) || 1);
  return { mean, std };
}

/**
 * Обучает модель.
 * @param {number[][]} x признаки
 * @param {number[]} y 1: дефолт, 0: возврат кредита
 * @returns {{mean:number[], std:number[], weights:number[], bias:number}}
 */
export function train(x, y, { epochs = 1500, rate = 0.3, l2 = 0.001 } = {}) {
  const { mean, std } = standardizer(x);
  const z = x.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const n = z.length;
  const k = FEATURES.length;
  let weights = new Array(k).fill(0);
  const base = y.reduce((s, v) => s + v, 0) / n;
  let bias = Math.log(base / (1 - base));
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(k).fill(0);
    let gradBias = 0;
    for (let i = 0; i < n; i++) {
      let t = bias;
      for (let j = 0; j < k; j++) t += weights[j] * z[i][j];
      const err = sigmoid(t) - y[i];
      gradBias += err;
      for (let j = 0; j < k; j++) grad[j] += err * z[i][j];
    }
    bias -= (rate * gradBias) / n;
    weights = weights.map((w, j) => w - rate * (grad[j] / n + l2 * w));
  }
  return { mean, std, weights, bias };
}

/** Вероятность дефолта и вклад каждого признака в логит (положительный вклад повышает риск). */
export function predict(model, features) {
  const contributions = features.map((v, j) => model.weights[j] * ((v - model.mean[j]) / model.std[j]));
  const logit = model.bias + contributions.reduce((s, c) => s + c, 0);
  return { pd: sigmoid(logit), logit, contributions };
}

/** Метрики качества: точность при пороге, AUC (вероятность, что дефолтный заёмщик получил PD выше недефолтного), KS. */
export function evaluate(model, x, y, threshold = 0.5) {
  const pds = x.map((row) => predict(model, row).pd);
  let correct = 0;
  for (let i = 0; i < y.length; i++) if ((pds[i] >= threshold ? 1 : 0) === y[i]) correct++;
  const order = pds.map((p, i) => [p, y[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  let positives = 0;
  order.forEach(([, label], i) => { if (label === 1) { rankSum += i + 1; positives++; } });
  const negatives = y.length - positives;
  const auc = positives && negatives ? (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives) : 0.5;
  let cumPos = 0;
  let cumNeg = 0;
  let ks = 0;
  for (const [, label] of order) {
    if (label === 1) cumPos += 1 / positives; else cumNeg += 1 / negatives;
    ks = Math.max(ks, Math.abs(cumPos - cumNeg));
  }
  return { accuracy: correct / y.length, auc, ks, defaultRate: positives / y.length, samples: y.length };
}

/** Детерминированный генератор псевдослучайных чисел (mulberry32): обучение воспроизводимо. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Синтетическая «кредитная история» для учебного обучения модели. Реальных данных банка у проекта нет,
 * поэтому дефолт моделируется известной зависимостью с шумом: риск растёт с долговой нагрузкой, размером кредита
 * и числом иждивенцев и падает с доходом, стажем и возрастом (до пенсионного). Модель восстанавливает эту зависимость по выборке.
 */
export function syntheticHistory(n, seed = 2026) {
  const rand = rng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const x = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const age = Math.min(Math.max(Math.round(38 + 11 * normal()), 18), 75);
    const incomeByn = Math.exp(Math.log(1700) + 0.45 * normal());
    const experienceYears = Math.min(Math.max(Math.abs(normal()) * 6 * Math.min(1, (age - 17) / 15), 0), 10);
    const dependents = Math.min(Math.round(Math.abs(normal()) * 1.1), 5);
    const loanToIncome = Math.min(Math.exp(Math.log(0.45) + 0.7 * normal()), 5);
    const obligationsShare = Math.max(0, 0.08 + 0.12 * normal()) * (rand() < 0.45 ? 1 : 0);
    const dti = Math.min((obligationsShare + loanToIncome * 0.075) * 100 + 4 * Math.abs(normal()), 120);
    const logit = -2.35 + 0.055 * (dti - 28) - 0.45 * Math.log(incomeByn / 1700) - 0.16 * (experienceYears - 3)
      + 0.2 * (dependents - 1) + 0.28 * (loanToIncome - 0.5) - 0.012 * (Math.min(age, 50) - 38) + 0.5 * normal();
    x.push([age, Math.log(incomeByn), dti, experienceYears, dependents, loanToIncome]);
    y.push(rand() < sigmoid(logit) ? 1 : 0);
  }
  return { x, y };
}
