// Smoke: transactions — filter bar (chain/token/user search/date), tab switches.
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

  // Filter bar: tab switcher visible
  const allTab = page.locator('.tab, [role="tab"]', { hasText: /all/i });
  await expect(allTab.first()).toBeVisible({ timeout: 8_000 });

  // Tab switches: All → Deposits → Sweeps → Withdrawals → back to All
  for (const label of ['deposits', 'sweeps', 'withdrawals', 'all']) {
    const tab = page.locator('.tab, [role="tab"]', { hasText: new RegExp(label, 'i') });
    if (await tab.count()) await tab.first().click();
  }

  // Chain filter button
  const chainFilter = page.locator('.filter-btn, button', { hasText: /chain/i });
  if (await chainFilter.count()) {
    await expect(chainFilter.first()).toBeVisible({ timeout: 6_000 });
    await chainFilter.first().click();
  }

  // Token filter button
  const tokenFilter = page.locator('.filter-btn, button', { hasText: /token/i });
  if (await tokenFilter.count()) await tokenFilter.first().click();

  // Date filter button
  const dateFilter = page.locator('.filter-btn, button', { hasText: /date/i });
  if (await dateFilter.count()) await dateFilter.first().click();

  // User search input
  const searchInput = page.locator(
    'input[placeholder*="search" i], input[placeholder*="user" i], input[type="search"]'
  );
  if (await searchInput.count()) {
    await searchInput.first().fill('test');
    await page.waitForTimeout(400);
    await searchInput.first().clear();
  }

  // Table container renders (rows or empty state)
  await page.waitForTimeout(1_500);
  const table = await page.locator('table').count();
  const empty = await page.locator('.text-muted').count();
  expect(table + empty).toBeGreaterThan(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
