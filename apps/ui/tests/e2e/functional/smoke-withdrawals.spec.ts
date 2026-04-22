// Smoke: withdrawals — create modal open/cancel, filters, tab switch.
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

  // Create modal: open → fill email → cancel
  const newBtn = page.locator('button').filter({ hasText: /new withdrawal|tạo withdrawal/i });
  await expect(newBtn).toBeVisible({ timeout: 10_000 });
  await newBtn.click();
  const sheet = page.locator('.sheet, [role="dialog"]').first();
  await expect(sheet).toBeVisible({ timeout: 5_000 });

  // Fill email field if present
  const emailInput = sheet.locator('input[type="email"], input[placeholder*="email" i]');
  if (await emailInput.count()) await emailInput.fill('test@example.com');

  // Cancel / close
  const cancelBtn = sheet.locator('button', { hasText: /cancel|close/i });
  if (await cancelBtn.count()) {
    await cancelBtn.first().click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(sheet).not.toBeVisible({ timeout: 5_000 });

  // Filter: status
  const statusFilter = page.locator('.filter-btn, button', { hasText: /status/i }).first();
  if (await statusFilter.isVisible()) await statusFilter.click();

  // Filter: chain
  const chainFilter = page.locator('.filter-btn, button', { hasText: /chain/i }).first();
  if (await chainFilter.isVisible()) await chainFilter.click();

  // Tab switches: All / Pending / Completed / Failed
  for (const label of ['pending', 'completed', 'failed', 'all']) {
    const tab = page.locator('.tab, [role="tab"]', { hasText: new RegExp(label, 'i') });
    if (await tab.count()) await tab.first().click();
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
