// Smoke: deposits page loads, Manual credit button clickable → modal opens.
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

  // Table should render (rows or empty state)
  const table = page.locator('table, tbody, .table-wrapper').first();
  await expect(table).toBeVisible({ timeout: 10_000 });

  // Manual credit button opens modal
  const creditBtn = page.locator('button', { hasText: /manual credit/i });
  await expect(creditBtn).toBeVisible({ timeout: 10_000 });
  await creditBtn.click();
  const modal = page.locator('.modal-overlay, [role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
