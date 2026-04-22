// Smoke: recovery — stuck tx table / empty state, bump/cancel modal interactions.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('recovery smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'recovery');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Wait for data load
  await page.waitForTimeout(2_000);

  // Either a table or empty-state must be present
  const table = await page.locator('table').count();
  const emptyState = await page.locator('.card, .text-muted').count();
  expect(table + emptyState).toBeGreaterThan(0);

  // If rows exist, interact with bump/cancel buttons
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.count()) {
    // Bump button → opens modal if present → cancel
    const bumpBtn = firstRow.locator('button', { hasText: /bump/i });
    if (await bumpBtn.count()) {
      await bumpBtn.click();
      const modal = page.locator('[role="dialog"], .modal').first();
      if (await modal.isVisible()) {
        const cancelBtn = modal.locator('button', { hasText: /cancel/i });
        if (await cancelBtn.count()) await cancelBtn.click();
        else await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({ timeout: 5_000 });
      }
    }

    // Cancel tx button → opens confirm modal → cancel
    const cancelTxBtn = firstRow.locator('button', { hasText: /cancel/i });
    if (await cancelTxBtn.count()) {
      await cancelTxBtn.click();
      const modal2 = page.locator('[role="dialog"], .modal').first();
      if (await modal2.isVisible()) {
        const dismissBtn = modal2.locator('button', { hasText: /cancel|dismiss|close/i });
        if (await dismissBtn.count()) await dismissBtn.first().click();
        else await page.keyboard.press('Escape');
        await expect(modal2).not.toBeVisible({ timeout: 5_000 });
      }
    }
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
