import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      REDIS_URL: 'rediss://default:test@localhost:6379',
      JWT_SECRET: 'test_secret_that_is_at_least_32_characters_long_for_unit_tests',
      FRONTEND_URL: 'http://localhost:5173',
    },
  },
});
