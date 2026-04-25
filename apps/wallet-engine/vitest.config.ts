import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Prevent any real network calls — tests use mocks only
    testTimeout: 10_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.test.ts',
        '**/*.fixtures.ts',
      ],
      lines: 95,
      branches: 85,
      functions: 95,
      statements: 95,
    },
  },
});
