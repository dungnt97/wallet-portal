import path from 'node:path';
import react from '@vitejs/plugin-react';
// Vitest config — jsdom environment, path aliases matching vite.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    // Exclude Playwright E2E specs — they are run by Playwright, not vitest
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'dist/**',
        'e2e/**',
        'tests/**',
        'src/i18n/locales/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/tests/**',
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'playwright.config.ts',
        'vite.config.ts',
        'vitest.config.ts',
        'src/scripts/**',
      ],
      thresholds: {
        lines: 16,
        branches: 60,
        functions: 30,
        statements: 16,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
