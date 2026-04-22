// Smoke: recon page loads, "Run scan now" button opens confirm modal.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('recon smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'recon');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // "Run scan now" / "Run recon" button (disabled while running, skip click if so)
  const runBtn = page.locator('button', { hasText: /run scan now|run recon|run now/i });
  await expect(runBtn.first()).toBeVisible({ timeout: 10_000 });

  const isDisabled = await runBtn.first().isDisabled();
  if (!isDisabled) {
    await runBtn.first().click();
    // Confirm modal should open
    const modal = page.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Close without submitting
    const cancelBtn = modal.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.count()) await cancelBtn.click();
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
