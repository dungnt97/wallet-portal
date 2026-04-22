// Smoke: sweep — scan button clickable, gas monitor card, batch history section.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('sweep smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'sweep');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Chain switcher (BNB/SOL segmented control)
  const chainSwitcher = page.locator('.segmented, [role="group"]').first();
  await expect(chainSwitcher).toBeVisible({ timeout: 8_000 });

  // Scan button should be present and clickable (does not fire real tx)
  const scanBtn = page.locator('button', { hasText: /scan|sweep now|run sweep/i });
  if (await scanBtn.count()) {
    await expect(scanBtn.first()).toBeVisible({ timeout: 6_000 });
    // Only click if not disabled (may be mid-sweep)
    if (!(await scanBtn.first().isDisabled())) await scanBtn.first().click();
    // If a confirm modal opens, cancel it
    const modal = page.locator('[role="dialog"], .modal').first();
    if (await modal.isVisible()) {
      const cancelBtn = modal.locator('button', { hasText: /cancel/i });
      if (await cancelBtn.count()) await cancelBtn.click();
      else await page.keyboard.press('Escape');
    }
  }

  // Gas monitor card visible — GasMonitor renders .gas-monitor div
  const gasCard = page.locator('.gas-monitor');
  await expect(gasCard.first()).toBeVisible({ timeout: 8_000 });

  // Batch history section visible (table or empty state)
  await page.waitForTimeout(1_000);
  const history = page.locator('.card, .pro-card', { hasText: /history|batch/i });
  if (await history.count()) await expect(history.first()).toBeVisible({ timeout: 6_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
