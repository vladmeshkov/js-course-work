// Окружение для автотестов. Тесты используют отдельную базу talerbank_test.
export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://taler:taler@localhost:5432/talerbank_test',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://taler:taler@localhost:5432/talerbank_test',
  SESSION_SECRET: 'test-secret',
  DATA_KEY: '11'.repeat(32),
  BANK_CODE: 'TLRB'
};
