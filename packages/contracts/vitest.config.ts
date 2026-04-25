// Vitest configuration for contracts package
// This package contains generated ABI data and type aliases — coverage is not applicable
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Exclude all files from coverage — this package is pure types/generated ABI
      exclude: ['**/*'],
    },
  },
});
