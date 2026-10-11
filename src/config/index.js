/**
 * Конфигурация приложения. Значения берутся из переменных окружения (.env).
 */
const env = process.env;

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export const config = {
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 3000),
  databaseUrl: env.NODE_ENV === 'test' ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  dataKey: Buffer.from(required('DATA_KEY'), 'hex'),
  bankCode: env.BANK_CODE || 'TLRB',
  login: {
    maxAttempts: Number(env.LOGIN_MAX_ATTEMPTS || 5),
    lockMinutes: Number(env.LOGIN_LOCK_MINUTES || 15)
  }
};

if (config.dataKey.length !== 32) {
  throw new Error('DATA_KEY должен содержать 64 шестнадцатеричных символа (32 байта)');
}
