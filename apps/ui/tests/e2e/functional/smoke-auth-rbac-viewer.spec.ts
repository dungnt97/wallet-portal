// Smoke: RBAC viewer (Kenji) — verifies write controls are absent/disabled,
// and read-only views still load.
//
// RBAC matrix relevant here (from auth-provider.tsx PERMS):
//   ops.read              → admin|operator|treasurer  → viewer gets "Unauthorized" card
//   ops.killswitch.toggle → admin only                → definitely absent for viewer
//   withdrawal.create     → admin|operator            → disabled for viewer
//   user.view             → all roles                 → /app/users loads
//   user.create           → admin|operator            → "Add user" disabled for viewer
import { expect, test } from '@playwright/test';
import { gotoApp, loginAsViewer } from './multi-role-fixture';

test.describe('smoke-auth-rbac-viewer', () => {
  test('viewer: /app/dashboard loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loginAsViewer(page);
    await gotoApp(page, 'dashboard');

    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('viewer: /app/withdrawals — "New withdrawal" button is disabled', async ({ page }) => {
    await loginAsViewer(page);
    await gotoApp(page, 'withdrawals');

    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // withdrawal.create → admin|operator only. Viewer sees disabled lock button.
    const newBtn = page.locator('button', { hasText: /new withdrawal/i });
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
    await expect(newBtn).toBeDisabled();
  });

  test('viewer: /app/ops — kill-switch toggle absent (ops.read denied → unauthorized card shown)', async ({
    page,
  }) => {
    await loginAsViewer(page);
    await gotoApp(page, 'ops');

    // Viewer lacks ops.read → OpsPage renders "Unauthorized" placeholder card, not the
    // full ops controls. Either way, the kill-switch toggle must not be present.
    await page.waitForTimeout(1_500);

    const ksToggle = page.locator('.toggle').first();
    const toggleVisible = await ksToggle.isVisible().catch(() => false);
    expect(toggleVisible, 'Kill-switch toggle must not be visible for viewer').toBe(false);
  });

  test('viewer: /app/users loads (user.view allowed) and "Add user" is disabled', async ({
    page,
  }) => {
    await loginAsViewer(page);
    await gotoApp(page, 'users');

    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Switch to End users tab
    const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
    await expect(endUsersTab).toBeVisible({ timeout: 8_000 });
    await endUsersTab.click();

    // user.create → admin|operator only. Viewer sees disabled button.
    const addUserBtn = page.locator('button', { hasText: /add user/i });
    await expect(addUserBtn).toBeVisible({ timeout: 5_000 });
    await expect(addUserBtn).toBeDisabled();
  });
});
