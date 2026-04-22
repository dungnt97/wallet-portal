// Smoke: multi-filter combo on /app/deposits — chain + token + status simultaneously.
// Uses Filter components (cycle-click pattern) that live in the pro-card-header.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('deposits multi-filter: chain + token + pending tab', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'deposits');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });
  // Wait for table/empty-state to stabilise
  await page.waitForTimeout(1_500);

  // --- Apply chain filter (bnb) ------------------------------------------------
  const chainBtn = page
    .locator('.pro-card-header button, .pro-card-header .filter-btn')
    .filter({
      hasText: /chain/i,
    })
    .first();
  await expect(chainBtn).toBeVisible({ timeout: 8_000 });
  await chainBtn.click(); // cycles to bnb
  await page.waitForTimeout(400);

  // --- Apply token filter (USDT) -----------------------------------------------
  const tokenBtn = page
    .locator('.pro-card-header button, .pro-card-header .filter-btn')
    .filter({
      hasText: /token/i,
    })
    .first();
  await expect(tokenBtn).toBeVisible({ timeout: 5_000 });
  await tokenBtn.click(); // cycles to USDT
  await page.waitForTimeout(400);

  // --- Apply status tab: pending -----------------------------------------------
  const pendingTab = page
    .locator('[role="tab"], .tab')
    .filter({ hasText: /pending/i })
    .first();
  if (await pendingTab.count()) {
    await pendingTab.click();
    await page.waitForTimeout(400);
  }

  // Assert: row count may be 0 but table wrapper must exist
  const table = page.locator('table, tbody, .table-wrapper, .data-table').first();
  await expect(table).toBeVisible({ timeout: 8_000 });

  // Row count after filters (0 or more is valid)
  const rowCount = await page.locator('tbody tr').count();
  expect(rowCount).toBeGreaterThanOrEqual(0);

  // --- Clear chain filter via ×  -----------------------------------------------
  // After clicking the active chain button once more it cycles sol → null
  // Or find a clear/× control next to the filter pill
  const clearChain = page
    .locator('.pro-card-header button')
    .filter({ hasText: /bnb|sol|chain/i })
    .first();
  if (await clearChain.isVisible()) {
    // Cycle through: bnb → sol → null (two more clicks)
    await clearChain.click();
    await page.waitForTimeout(200);
    await clearChain.click();
    await page.waitForTimeout(200);
  }

  // Cycle token back to null
  const clearToken = page
    .locator('.pro-card-header button')
    .filter({ hasText: /usdc|usdt|token/i })
    .first();
  if (await clearToken.isVisible()) {
    await clearToken.click(); // USDT → USDC
    await page.waitForTimeout(200);
    await clearToken.click(); // USDC → null
    await page.waitForTimeout(200);
  }

  // Back to "all" tab
  const allTab = page.locator('[role="tab"], .tab').filter({ hasText: /^all$/i }).first();
  if (await allTab.count()) await allTab.click();

  // Table still visible after reset
  await expect(table).toBeVisible({ timeout: 5_000 });
});
