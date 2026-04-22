// Smoke: deposits — filter bar interactions, table render, manual credit modal, export CSV.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('deposits smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'deposits');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Table or empty state renders
  const table = page.locator('table, tbody, .table-wrapper').first();
  await expect(table).toBeVisible({ timeout: 10_000 });

  // Filter: chain — click Filter button labelled "Chain"
  const chainFilter = page.locator('.filter-btn, button', { hasText: /chain/i }).first();
  if (await chainFilter.isVisible()) await chainFilter.click();

  // Filter: token — click Filter button labelled "Token"
  const tokenFilter = page.locator('.filter-btn, button', { hasText: /token/i }).first();
  if (await tokenFilter.isVisible()) await tokenFilter.click();

  // Filter: date — click Filter button labelled "Date"
  const dateFilter = page.locator('.filter-btn, button', { hasText: /date/i }).first();
  if (await dateFilter.isVisible()) await dateFilter.click();

  // Status tabs — click Pending tab
  const pendingTab = page.locator('.tab, [role="tab"]', { hasText: /pending/i });
  if (await pendingTab.count()) await pendingTab.first().click();

  // Export CSV button clickable (don't actually download)
  const exportBtn = page.locator('button', { hasText: /export/i });
  await expect(exportBtn.first()).toBeVisible({ timeout: 6_000 });

  // Manual credit modal: open → close
  const creditBtn = page.locator('button', { hasText: /manual credit/i });
  await expect(creditBtn).toBeVisible({ timeout: 10_000 });
  await creditBtn.click();
  const modal = page.locator('.modal-overlay, [role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });
  // Close via cancel button or Escape
  const cancelBtn = modal.locator('button', { hasText: /cancel/i });
  if (await cancelBtn.count()) {
    await cancelBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
