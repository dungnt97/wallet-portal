// Smoke: transactions page loads with filter bar and table visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('transactions smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'transactions');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Filter bar: tab switcher (All / Deposits / Sweeps / Withdrawals)
  const allTab = page.locator('.tab, [role="tab"]', { hasText: /all/i });
  await expect(allTab.first()).toBeVisible({ timeout: 8_000 });

  // Chain / Status / Date filter buttons
  const chainFilter = page.locator('button', { hasText: /chain/i });
  await expect(chainFilter.first()).toBeVisible({ timeout: 6_000 });

  // Table container renders (rows or empty state)
  await page.waitForTimeout(1_500);
  const table = await page.locator('table').count();
  const empty = await page.locator('.text-muted').count();
  expect(table + empty).toBeGreaterThan(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
