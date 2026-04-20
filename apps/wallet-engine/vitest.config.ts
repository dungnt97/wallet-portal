import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Prevent any real network calls — tests use mocks only
    testTimeout: 10_000,
    include: ['src/**/*.test.ts'],
  },
});
