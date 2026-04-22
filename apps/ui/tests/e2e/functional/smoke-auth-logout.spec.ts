// Smoke: auth logout — login as Mira → open user menu → click Logout → assert /login redirect.
// Note: __dev_staff__ key persists in localStorage after logout (addInitScript already ran),
// but AuthProvider clears in-memory staff state on logout → LoginGate redirects to /login.
import { expect, test } from '@playwright/test';
import { gotoApp, loginAsAdmin } from './multi-role-fixture';

test('logout redirects to /login', async ({ page }) => {
  await loginAsAdmin(page);
  await gotoApp(page, 'dashboard');

  // Open user menu
  const trigger = page.locator('.user-menu-trigger');
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();

  const menu = page.locator('.user-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });

  // Click "Sign out" / "Logout" item (danger class)
  const signOutBtn = menu.locator('button.danger');
  await expect(signOutBtn).toBeVisible({ timeout: 3_000 });
  await signOutBtn.click();

  // After logout, LoginGate redirects unauthenticated users to /login
  await page.waitForURL('**/login', { timeout: 10_000 });
  await expect(page.locator('.login-root').first()).toBeVisible({ timeout: 8_000 });
});
