// Smoke: sweep page loads with heading and chain switcher.
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

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
