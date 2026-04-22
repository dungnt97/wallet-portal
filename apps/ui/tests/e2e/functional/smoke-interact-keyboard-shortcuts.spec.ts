// Smoke: keyboard shortcuts — g+key navigation + '?' help overlay.
// Shortcuts are disabled while cmd palette / modals are open (see app-layout.tsx).
// g d → /app/dashboard (no-op if already there)
// g w → /app/withdrawals
// g c → /app/cold
// g u → /app/users
// ?   → ShortcutsHelpOverlay opens  (role="dialog" aria-label contains "shortcuts")
// Esc → overlay closes
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('keyboard shortcuts: g+key nav + ? help overlay', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  // Ensure page is ready and no modal is open (shortcuts disabled when modal open)
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

  // Helper: ensure body is focused (not an input) so shortcuts fire
  const focusBody = () => page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  // --- g d → /app/dashboard (already there — URL stays) -----------------------
  await focusBody();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('d');
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/\/app\/dashboard/);

  // --- g w → /app/withdrawals --------------------------------------------------
  await focusBody();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('w');
  await page.waitForURL('**/app/withdrawals', { timeout: 5_000 });
  expect(page.url()).toMatch(/\/app\/withdrawals/);

  // --- g c → /app/cold ---------------------------------------------------------
  await focusBody();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('c');
  await page.waitForURL('**/app/cold', { timeout: 5_000 });
  expect(page.url()).toMatch(/\/app\/cold/);

  // --- g u → /app/users --------------------------------------------------------
  await focusBody();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('u');
  await page.waitForURL('**/app/users', { timeout: 5_000 });
  expect(page.url()).toMatch(/\/app\/users/);

  // --- ? → help overlay opens --------------------------------------------------
  await focusBody();
  await page.keyboard.press('?');
  // ShortcutsHelpOverlay renders role="dialog" with aria-label containing "shortcuts"
  const overlay = page.locator('[role="dialog"][aria-label*="shortcut" i]');
  await expect(overlay).toBeVisible({ timeout: 5_000 });

  // --- Escape → overlay closes -------------------------------------------------
  await page.keyboard.press('Escape');
  await expect(overlay).not.toBeVisible({ timeout: 5_000 });
});
