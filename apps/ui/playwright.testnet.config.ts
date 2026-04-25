import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * Playwright configuration for real-testnet e2e suite.
 *
 * Separate from playwright.config.ts (smoke tests with mocked API).
 * This config targets BNB Chapel + Solana Devnet with real on-chain broadcasts.
 *
 * Key differences from smoke config:
 *   - 3 min per-test timeout (chain waits, block confirms)
 *   - Serial workers (1) — nonce management requires sequential tx ordering
 *   - retries: 2 in CI — RPC timeouts are transient, not bugs
 *   - Video on failure — helps debug flaky testnet behaviour
 *   - No snapshot assertions — visual regression not relevant here
 *   - webServer starts the UI dev server; backend services must already be running
 *     (handled by CI workflow or local `pnpm dev:all`)
 *
 * Run locally:
 *   pnpm test:e2e:testnet
 *
 * Run in CI:
 *   See .github/workflows/e2e-testnet.yml
 */
import { defineConfig, devices } from '@playwright/test';

// Load .env.testnet if present — CI injects secrets via environment instead.
// Using dynamic import so we don't fail on missing dotenv in environments
// where secrets come from the process environment directly.
const envTestnetPath = resolve(import.meta.dirname, '.env.testnet');
if (existsSync(envTestnetPath)) {
  // dotenv is available in the infra chain package; inline parse to avoid dependency
  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(envTestnetPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

export default defineConfig({
  // Only the real-testnet specs — never runs smoke or visual tests
  testDir: './tests/e2e/testnet',

  // Serial: BNB nonce must increment sequentially; Squads tx index must be monotonic
  workers: 1,
  fullyParallel: false,

  // 2 retries in CI for transient RPC timeouts; 0 locally to fail fast
  retries: process.env.CI ? 2 : 0,

  // Per-test timeout: 3 min default, individual tests override via test.setTimeout()
  timeout: 180_000,

  // Expect assertions: generous timeout for chain-state assertions
  expect: {
    timeout: 30_000,
  },

  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: 'playwright-testnet-report',
      },
    ],
    // JUnit for CI test result parsing
    ['junit', { outputFile: 'playwright-testnet-results.xml' }],
  ],

  use: {
    baseURL: process.env.UI_BASE_URL ?? 'http://localhost:5173',
    locale: 'en-US',

    // Capture video on first retry — essential for debugging testnet flakes
    video: 'on-first-retry',

    // Always capture trace on retry — shows exact network calls and timeline
    trace: 'on-first-retry',

    // Screenshot on every failure
    screenshot: 'only-on-failure',

    // Longer navigation timeout for slow testnet-backed pages
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },

  // Run setup verification project first — fails early if infrastructure not ready
  projects: [
    {
      name: 'testnet-setup',
      testMatch: '**/testnet-setup-verify.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'testnet-flows',
      testMatch: [
        '**/testnet-deposit-bnb.spec.ts',
        '**/testnet-deposit-sol.spec.ts',
        '**/testnet-sweep-bnb.spec.ts',
        '**/testnet-withdrawal-bnb.spec.ts',
        '**/testnet-reconciliation.spec.ts',
        '**/testnet-cold-balance.spec.ts',
        '**/testnet-idempotency.spec.ts',
      ],
      dependencies: ['testnet-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start Vite dev server before tests.
  // In CI: always start fresh. Locally: reuse if already running on :5173.
  webServer: {
    command: 'pnpm dev',
    url: process.env.UI_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      VITE_AUTH_DEV_MODE: 'true',
      VITE_TEST_MODE: 'true',
      // RPC endpoints forwarded to Vite so the UI can call on-chain directly if needed
      VITE_BNB_TESTNET_RPC:
        process.env.BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      VITE_SOL_DEVNET_RPC: process.env.SOL_DEVNET_RPC ?? 'https://api.devnet.solana.com',
    },
  },
});
