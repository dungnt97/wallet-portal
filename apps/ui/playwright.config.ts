// Playwright configuration for visual regression tests.
// Nightly CI + workflow_dispatch only — NOT PR-blocking to avoid snapshot churn.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  // Functional smoke tests share dev-login localStorage + single dev server —
  // parallel workers race. Serial run completes in ~50s, acceptable for smoke.
  workers: 1,
  fullyParallel: false,

  // Retry once on failure before marking red (reduces transient flakes)
  retries: process.env.CI ? 1 : 1,

  // HTML reporter for artifact upload on failure
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  // Snapshot path pattern: tests/e2e/__screenshots__/{testFile}/{testName}/{projectName}.png
  snapshotPathTemplate:
    'tests/e2e/__screenshots__/{testFileDir}/{testFileName}/{testName}/{projectName}.png',

  use: {
    baseURL: 'http://localhost:5173',
    locale: 'en-US',
    // Disable animations + transitions globally for deterministic screenshots
    contextOptions: {
      reducedMotion: 'reduce',
    },
    // Capture on failure
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  expect: {
    toHaveScreenshot: {
      // Allow up to 100 pixel diff or 1% of total pixels — tolerates minor AA differences
      maxDiffPixels: 100,
      threshold: 0.1,
    },
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
      },
    },
  ],

  // Start Vite dev server before tests run.
  // In CI: always start fresh. Locally: reuse if already running.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_AUTH_DEV_MODE: 'true',
      VITE_TEST_MODE: 'true',
    },
  },
});
