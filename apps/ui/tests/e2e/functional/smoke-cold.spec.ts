// Smoke: cold page loads with at least one chain section visible.
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

  // At least one chain section (BNB or SOL)
  const chainSection = page.locator('.cold-pair, section').first();
  await expect(chainSection).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
