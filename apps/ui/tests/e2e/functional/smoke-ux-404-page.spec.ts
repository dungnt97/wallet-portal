// Smoke UX: 404 / unknown route handling + viewer RBAC on /app/ops.
// Router has catch-all: { path: '*', element: <Navigate to="dashboard" replace /> }
// So /app/nonexistent-route redirects to /app/dashboard.
// Viewer lacks ops.read → OpsPage renders an "Unauthorized" card (not the ops controls).
import { test as base, expect } from '@playwright/test';
import { seedRealAuth as seedAdmin } from '../support/real-api-fixture';
import { gotoApp, loginAsViewer, seedRealAuth } from './multi-role-fixture';

base.describe('smoke-ux-404-page', () => {
  base.test('unknown /app/* route redirects to /app/dashboard', async ({ page }) => {
    await seedAdmin(page);
    await page.goto('/app/nonexistent-route-xyz');
    // Router catch-all inside /app/* maps to dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 });
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 10_000 });
  });

  base.test(
    'viewer on /app/ops sees unauthorized card or redirect (no kill-switch toggle)',
    async ({ page }) => {
      await loginAsViewer(page);
      await gotoApp(page, 'ops');

      // Give page time to render RBAC decision
      await page.waitForTimeout(2_000);

      // Kill-switch toggle must NOT be present for viewer
      const ksToggle = page.locator('.toggle').first();
      const toggleVisible = await ksToggle.isVisible().catch(() => false);
      expect(toggleVisible, 'Kill-switch toggle must not be visible for viewer role').toBe(false);

      // Either an "Unauthorized" placeholder is shown, or the page redirected away —
      // either outcome is acceptable; we just assert the toggle is absent (checked above).
      // Document: if ops page starts rendering for viewers this test will catch the regression.
    }
  );
});
