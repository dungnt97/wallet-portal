// Vitest configuration for config package
// This package contains only static configuration files — coverage is not applicable
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Exclude all files from coverage — this package is pure configuration
      exclude: ['**/*'],
    },
  },
});
