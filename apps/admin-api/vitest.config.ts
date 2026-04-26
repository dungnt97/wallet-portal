// Vitest configuration for admin-api unit tests
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use tsx to handle TypeScript + ESM imports
    pool: 'forks',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'src/db/**',
        'src/server.ts',
        // Entry-point composition files — not unit-testable; covered by integration tests
        'src/app.ts',
        'src/index.ts',
        'src/routes/index.ts',
        'drizzle.config.ts',
      ],
    },
  },
});
