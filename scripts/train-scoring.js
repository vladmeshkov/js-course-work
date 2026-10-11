// Обучает регрессионную модель скоринга на синтетической истории и делает её активной.
// Использование: npm run scoring:train [-- число_записей]
import { trainAndActivate } from '../src/services/scoringService.js';
import { FEATURES } from '../src/lib/regression.js';
import { pool } from '../src/db/pool.js';

const samples = Number(process.argv[2]) || 6000;
const { version, metrics, model } = await trainAndActivate({ samples });
console.log(`Модель версии ${version} обучена на ${samples} записях и включена.`);
console.log('Коэффициенты (по стандартизованным признакам; плюс повышает риск, минус снижает):');
FEATURES.forEach((f, i) => console.log(`  ${f.label.padEnd(26)} ${model.weights[i] >= 0 ? '+' : ''}${model.weights[i].toFixed(3)}`));
console.log(`  свободный член            ${model.bias.toFixed(3)}`);
console.log(`Качество на отложенной выборке: точность ${(metrics.accuracy * 100).toFixed(1)} %, AUC ${metrics.auc.toFixed(3)}, KS ${metrics.ks.toFixed(3)}, доля дефолтов ${(metrics.defaultRate * 100).toFixed(1)} %`);
await pool.end();
