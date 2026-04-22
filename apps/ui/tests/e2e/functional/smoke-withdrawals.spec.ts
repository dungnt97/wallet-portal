// Smoke: withdrawals page loads, "New withdrawal" button clickable → sheet opens.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('withdrawals smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'withdrawals');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  const newBtn = page.locator('button').filter({ hasText: /new withdrawal|tạo withdrawal/i });
  await expect(newBtn).toBeVisible({ timeout: 10_000 });
  await newBtn.click();

  const sheet = page.locator('.sheet, [role="dialog"]').first();
  await expect(sheet).toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
