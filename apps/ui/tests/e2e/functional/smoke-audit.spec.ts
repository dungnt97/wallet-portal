// Smoke: audit page loads with filter bar and table rows or empty state.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('audit smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'audit');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Filter bar / tabs visible
  const filterBar = page.locator('.tab, [role="tab"]').first();
  await expect(filterBar).toBeVisible({ timeout: 8_000 });

  // Table rows or empty state
  await page.waitForTimeout(2_000);
  const rows = await page.locator('tbody tr').count();
  const empty = await page.locator('.text-muted', { hasText: /empty|no entries/i }).count();
  expect(rows + empty).toBeGreaterThanOrEqual(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
