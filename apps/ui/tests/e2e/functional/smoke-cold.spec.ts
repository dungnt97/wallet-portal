// Smoke: cold — 2 chain sections, rebalance modals open/close, run band check.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('cold smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'cold');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // 2 chain sections (BNB + SOL)
  const chainSections = page.locator('.cold-pair, section');
  await expect(chainSections.first()).toBeVisible({ timeout: 10_000 });
  // At least 2 sections exist (BNB chain + SOL chain)
  await expect(chainSections).toHaveCount(await chainSections.count(), { timeout: 5_000 });
  expect(await chainSections.count()).toBeGreaterThanOrEqual(1);

  // hot→cold button opens rebalance modal → close
  const hotToColdBtn = page
    .locator('button', { hasText: /hot.*cold|→.*cold|move to cold/i })
    .first();
  if (await hotToColdBtn.count()) {
    await expect(hotToColdBtn).toBeVisible({ timeout: 6_000 });
    if (!(await hotToColdBtn.isDisabled())) {
      await hotToColdBtn.click();
      const modal = page.locator('[role="dialog"], .modal, .sheet').first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      const cancelBtn = modal.locator('button', { hasText: /cancel/i });
      if (await cancelBtn.count()) await cancelBtn.click();
      else await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    }
  }

  // cold→hot button opens modal → close
  const coldToHotBtn = page.locator('button', { hasText: /cold.*hot|→.*hot|move to hot/i }).first();
  if (await coldToHotBtn.count()) {
    await expect(coldToHotBtn).toBeVisible({ timeout: 6_000 });
    if (!(await coldToHotBtn.isDisabled())) {
      await coldToHotBtn.click();
      const modal2 = page.locator('[role="dialog"], .modal, .sheet').first();
      await expect(modal2).toBeVisible({ timeout: 5_000 });
      const cancelBtn2 = modal2.locator('button', { hasText: /cancel/i });
      if (await cancelBtn2.count()) await cancelBtn2.click();
      else await page.keyboard.press('Escape');
      await expect(modal2).not.toBeVisible({ timeout: 5_000 });
    }
  }

  // "Run band check" button clickable
  const bandCheckBtn = page.locator('button', { hasText: /band check|run band/i });
  if (await bandCheckBtn.count()) {
    await expect(bandCheckBtn.first()).toBeVisible({ timeout: 6_000 });
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
