import { defineConfig } from 'vitest/config';
import { testEnv } from './test/env.js';

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./test/globalSetup.js'],
    fileParallelism: false,
    hookTimeout: 30000
  }
});
