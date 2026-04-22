// Smoke: recovery page loads with stuck-tx table visible (empty state is fine).
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

  // Wait for loading spinner to disappear (data or empty state must render)
  await page.waitForTimeout(2_000);

  // Either a table or an empty-state card should be present
  const table = await page.locator('table').count();
  const emptyState = await page.locator('.card, .text-muted').count();
  expect(table + emptyState).toBeGreaterThan(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
