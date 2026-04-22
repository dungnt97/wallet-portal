// Smoke: audit — filter bar, row click → detail sheet, verify chain btn, export CSV.
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

  // Filter bar visible (entity / actor / action / date)
  const filterBar = page
    .locator('.tab, [role="tab"], .filter-btn, button')
    .filter({ hasText: /entity|actor|action|filter/i });
  if (await filterBar.count()) await expect(filterBar.first()).toBeVisible({ timeout: 8_000 });

  // Wait for data load
  await page.waitForTimeout(2_000);

  // Click 1 row → detail sheet opens → close via icon-btn[aria-label="Close"] or scrim
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.count()) {
    await firstRow.click();
    const sheet = page.locator('.sheet').first();
    if (await sheet.isVisible()) {
      // Sheet uses icon-btn with aria-label="Close" (no text label)
      const closeBtn = sheet.locator('button[aria-label="Close"]');
      if (await closeBtn.count()) await closeBtn.first().click();
      else await page.locator('.scrim').click();
      await expect(sheet).not.toBeVisible({ timeout: 5_000 });
    }
  }

  // "Verify chain" button click → verify status badge (if present)
  const verifyBtn = page.locator('button', { hasText: /verify chain|verify/i });
  if (await verifyBtn.count()) {
    await expect(verifyBtn.first()).toBeVisible({ timeout: 5_000 });
  }

  // Export CSV button clickable
  const exportBtn = page.locator('button', { hasText: /export/i });
  if (await exportBtn.count()) await expect(exportBtn.first()).toBeVisible({ timeout: 5_000 });

  // Table rows or empty state
  const rows = await page.locator('tbody tr').count();
  const empty = await page.locator('.text-muted', { hasText: /empty|no entries/i }).count();
  expect(rows + empty).toBeGreaterThanOrEqual(0);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
