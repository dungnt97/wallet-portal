// Smoke UX: session persistence across page reload.
// Mira logs in → navigates to /app/deposits → reloads (F5) →
// still on /app/deposits and topbar still shows "Mira".
// Auth is persisted via __dev_staff__ in localStorage (VITE_AUTH_DEV_MODE=true).
import { expect, test } from '@playwright/test';
import { DEV_ADMIN } from '../support/dev-auth-fixture';
import { seedRealAuth } from '../support/real-api-fixture';

test('session persists across page reload on /app/deposits', async ({ page }) => {
  // Seed Mira (admin) auth — addInitScript fires on every navigation including reload
  await seedRealAuth(page, DEV_ADMIN);

  // Navigate to deposits
  await page.goto('/app/deposits');
  await page.waitForSelector('.topbar', { timeout: 20_000 });
  await page.waitForTimeout(500);

  // Confirm we're on deposits and Mira is shown
  await expect(page).toHaveURL(/\/app\/deposits/, { timeout: 10_000 });
  const trigger = page.locator('.user-menu-trigger').first();
  await expect(trigger).toBeVisible({ timeout: 8_000 });
  await expect(trigger).toContainText('Mira', { timeout: 5_000 });

  // Reload the page (equivalent to F5)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar', { timeout: 20_000 });
  await page.waitForTimeout(500);

  // After reload: still on /app/deposits (not redirected to /login)
  await expect(page).toHaveURL(/\/app\/deposits/, { timeout: 10_000 });

  // Mira still shown in topbar — session not lost
  const triggerAfter = page.locator('.user-menu-trigger').first();
  await expect(triggerAfter).toBeVisible({ timeout: 8_000 });
  await expect(triggerAfter).toContainText('Mira', { timeout: 5_000 });
});
