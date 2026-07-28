import type { Config } from 'jest';

import baseConfig from './jest.config';

/**
 * Integration tests hit a real PostgreSQL + Redis (TEST_DB_URL /
 * TEST_REDIS_URL env vars) instead of mocking getKnex()/getRedis(). Kept in
 * a separate Jest project so `npm test` (the fast, no-infra loop used
 * after every patch) never accidentally requires a database to pass.
 *
 * Run with: npm run test:integration
 * Requires: migrations already applied to the test database
 *   (NODE_ENV=test npm run migrate)
 */
const config: Config = {
  ...baseConfig,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  // Real network/DB calls are slower than mocked unit tests.
  testTimeout: 60000,
  maxWorkers: 1,
};

export default config;
