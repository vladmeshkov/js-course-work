/*
 * Скоринг заявки на кредит. Каждому фактору соответствует число баллов, итог сравнивается с порогами.
 * Долговая нагрузка (ДН) по Инструкции Нацбанка № 149: не более 40 % дохода. Превышение даёт отказ независимо от баллов.
 */

/**
 * @typedef {object} ScoringInput
 * @property {number} age полных лет
 * @property {number} income доход в месяц, копейки
 * @property {number} obligations платежи по действующим кредитам в месяц, копейки
 * @property {number} newPayment ориентировочный платёж по новому кредиту, копейки
 * @property {number} experienceMonths стаж на последнем месте работы
 * @property {number} dependents число иждивенцев
 * @property {number} amount запрошенная сумма, копейки
 * @property {{maxDti:number, autoLimit:number, approve:number, manual:number}} limits
 */

/**
 * @param {ScoringInput} input
 * @returns {{score:number, dti:number, decision:'approve'|'manual'|'reject', notes:Array<{factor:string, points:number, text:string}>}}
 */
export function scoreApplication(input) {
  const { age, income, obligations, newPayment, experienceMonths, dependents, amount, limits } = input;
  const dti = ((obligations + newPayment) / income) * 100;
  const notes = [];
  const add = (factor, points, text) => notes.push({ factor, points, text });

  if (age < 21) add('Возраст', 5, 'До 21 года');
  else if (age <= 25) add('Возраст', 10, '21-25 лет');
  else if (age <= 45) add('Возраст', 20, '26-45 лет');
  else if (age <= 60) add('Возраст', 15, '46-60 лет');
  else add('Возраст', 5, 'Старше 60 лет');

  if (experienceMonths < 6) add('Стаж', 0, 'Менее 6 месяцев');
  else if (experienceMonths < 12) add('Стаж', 10, '6-12 месяцев');
  else if (experienceMonths < 36) add('Стаж', 20, '1-3 года');
  else add('Стаж', 30, 'Более 3 лет');

  if (dti <= 20) add('Долговая нагрузка', 30, 'До 20 %');
  else if (dti <= 30) add('Долговая нагрузка', 20, '20-30 %');
  else if (dti <= limits.maxDti) add('Долговая нагрузка', 10, `30-${limits.maxDti} %`);
  else add('Долговая нагрузка', 0, `Выше ${limits.maxDti} %`);

  if (dependents === 0) add('Иждивенцы', 10, 'Нет');
  else if (dependents === 1) add('Иждивенцы', 8, 'Один');
  else if (dependents === 2) add('Иждивенцы', 5, 'Двое');
  else add('Иждивенцы', 0, 'Трое и более');

  const ratio = amount / (income * 12);
  if (ratio <= 0.5) add('Сумма к годовому доходу', 10, 'До 50 %');
  else if (ratio <= 1) add('Сумма к годовому доходу', 5, '50-100 %');
  else add('Сумма к годовому доходу', 0, 'Более 100 %');

  const score = notes.reduce((sum, n) => sum + n.points, 0);
  let decision;
  if (dti > limits.maxDti) decision = 'reject';
  else if (score >= limits.approve && amount <= limits.autoLimit) decision = 'approve';
  else if (score >= limits.manual) decision = 'manual';
  else decision = 'reject';
  return { score, dti: Math.round(dti * 100) / 100, decision, notes };
}
