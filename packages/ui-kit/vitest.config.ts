// Vitest configuration for ui-kit package
// This package contains Tailwind preset and design tokens — coverage is not applicable
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Exclude all files from coverage — this package is pure configuration/tokens
      exclude: ['**/*'],
    },
  },
});
