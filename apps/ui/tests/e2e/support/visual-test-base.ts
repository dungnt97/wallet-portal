// Shared base for all visual regression specs.
// Composes mock-api + dev-auth into a single `test` fixture so each spec
// only needs: import { test, expect } from '../support/visual-test-base'
import { test as base, expect } from '@playwright/test';
import { seedDevAuth } from './dev-auth-fixture';
import { setupMockApi } from './mock-api';

// Re-export expect so specs only need one import
export { expect };

export const test = base.extend({
  // Auto-fixture: runs before every test in specs that import this module
  page: async ({ page }, use) => {
    // 1. Seed deterministic Date and freeze animations
    await setupMockApi(page);
    // 2. Seed dev-mode staff so LoginGate passes immediately
    await seedDevAuth(page);
    await use(page);
  },
});

/** Navigate to an /app/* route and wait for the page shell to be ready. */
export async function gotoApp(page: Parameters<typeof test>[1]['page'], path: string) {
  await page.goto(`/app/${path}`);
  // Wait for the app shell (sidebar nav) to be present — indicates React hydrated
  await page.waitForSelector('[data-testid="app-layout"], nav, .sidebar, aside', {
    timeout: 15_000,
  });
  // Brief idle — let any micro-animations settle (even with transitions disabled,
  // React state updates may cause one more frame)
  await page.waitForTimeout(300);
}
