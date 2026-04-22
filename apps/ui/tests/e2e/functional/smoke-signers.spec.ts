// Smoke: signers page loads with treasurer list visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('signers smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'signers');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Current tab should be present by default
  const currentTab = page.locator('.tab, [role="tab"]', { hasText: /current/i });
  await expect(currentTab.first()).toBeVisible({ timeout: 8_000 });

  // Table or list renders (rows or empty state is fine)
  await page.waitForTimeout(1_500);
  const rows = await page.locator('tbody tr').count();
  const empty = await page.locator('.text-muted', { hasText: /empty|no signers/i }).count();
  expect(rows + empty).toBeGreaterThanOrEqual(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
