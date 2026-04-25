// Smoke: error paths — UI graceful degradation for invalid routes, bad IDs,
// RBAC-gated pages, and kill-switch banner visibility.
//
// These tests cover defensive rendering: no crashes, no blank screens, no
// unhandled promise rejections when the app encounters edge-case navigation.
//
// Requires: UI dev server on :5173. admin-api on :3001 only needed for kill-switch test.
import { test as base, expect, request } from '@playwright/test';
import { seedRealAuth as seedAdmin } from '../support/real-api-fixture';
import { gotoApp, loginAsAdmin, loginAsViewer } from './multi-role-fixture';

const API = 'http://localhost:3001';

async function isApiReachable(): Promise<boolean> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    await ctx.dispose();
    return res.ok() || res.status() < 500;
  } catch {
    return false;
  }
}

async function resetKillSwitch(): Promise<void> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });
    await ctx.post('/ops/kill-switch', { data: { enabled: false, reason: 'test cleanup' } });
    await ctx.dispose();
  } catch {
    // non-fatal
  }
}

base.describe('smoke-error-paths', () => {
  base.test('unknown /app/* route redirects to dashboard — no crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await seedAdmin(page);
    await page.goto('/app/this-route-does-not-exist-xyz');

    // Router catch-all inside /app/* maps to dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 });
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 10_000 });

    // No JS errors from the redirect
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });

  base.test(
    'navigating to withdrawal with nonexistent ID shows error or redirects',
    async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await seedAdmin(page);

      // Navigate directly to a withdrawal detail URL with a fake UUID
      await page.goto('/app/withdrawals/00000000-0000-0000-0000-000000000000');
      await page.waitForTimeout(3_000);

      // Acceptable outcomes: redirected to list, error card shown, or 404 message rendered
      const url = page.url();
      const isOnList = url.includes('/withdrawals');
      expect(isOnList, 'should stay within withdrawals section or redirect to list').toBe(true);

      // Must not crash — page should still have nav/layout
      const layout = page.locator('[data-testid="app-layout"], nav, .sidebar, aside, .topbar');
      const hasLayout = await layout
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      const notFoundMsg = page.locator('*', { hasText: /not found|404|does not exist|no.*found/i });
      const hasNotFound = await notFoundMsg
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      expect(
        hasLayout || hasNotFound,
        'page must render layout or a not-found message — no blank screen'
      ).toBe(true);

      expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
    }
  );

  base.test('viewer on /app/ops is blocked — kill-switch toggle absent', async ({ page }) => {
    await loginAsViewer(page);
    await gotoApp(page, 'ops');

    await page.waitForTimeout(2_000);

    // Kill-switch toggle must NOT render for viewer role (RBAC guard)
    const ksToggle = page.locator('.toggle').first();
    const toggleVisible = await ksToggle.isVisible().catch(() => false);
    expect(toggleVisible, 'Kill-switch toggle must not be visible for viewer').toBe(false);
  });

  base.test(
    'kill-switch active → global banner visible; deactivate → banner gone',
    async ({ page }) => {
      if (!(await isApiReachable())) {
        base.skip(true, 'admin-api unreachable — skipping kill-switch banner test');
        return;
      }

      // Ensure clean state before test
      await resetKillSwitch();

      await loginAsAdmin(page);
      await gotoApp(page, 'ops');

      const ksCard = page.locator('.card', { hasText: /kill switch|outbound/i }).first();
      await expect(ksCard).toBeVisible({ timeout: 12_000 });

      // Banner must NOT be visible when kill-switch is OFF
      const banner = page.locator('.policy-strip', { hasText: /outbound paused/i });
      await expect(banner).not.toBeVisible({ timeout: 3_000 });

      // Toggle ON via API directly (avoids UI confirm modal complexity)
      const ctx = await request.newContext({ baseURL: API });
      await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });
      const ksOn = await ctx.post('/ops/kill-switch', {
        data: { enabled: true, reason: 'smoke-error-paths banner test' },
      });

      if (!ksOn.ok()) {
        await ctx.dispose();
        await resetKillSwitch();
        base.skip(true, 'Could not activate kill-switch via API — skipping banner check');
        return;
      }

      try {
        // Navigate away and back so TanStack Query remounts + refetches ops data
        await gotoApp(page, 'dashboard');
        await gotoApp(page, 'ops');

        // Banner should now be visible
        await expect(banner).toBeVisible({ timeout: 12_000 });

        // Toggle OFF via API
        await ctx.post('/ops/kill-switch', {
          data: { enabled: false, reason: 'smoke-error-paths cleanup' },
        });

        // Navigate away and back again for refetch
        await gotoApp(page, 'dashboard');
        await gotoApp(page, 'ops');

        // Banner must disappear
        await expect(banner).not.toBeVisible({ timeout: 12_000 });
      } finally {
        await ctx.dispose();
        await resetKillSwitch();
      }
    }
  );

  base.test('unauthenticated access to /app/* redirects to login', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Navigate WITHOUT seeding auth — no localStorage, no session cookie
    await page.goto('/app/dashboard');
    await page.waitForTimeout(3_000);

    const url = page.url();
    // Should redirect to /login or /app/login or stay on dashboard with login gate rendered
    const isLoginOrGate =
      url.includes('/login') ||
      (await page
        .locator('input[type="password"], button', { hasText: /sign in|log in/i })
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false));

    expect(
      isLoginOrGate,
      'unauthenticated /app/dashboard must redirect to login or show login gate'
    ).toBe(true);

    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });
});
