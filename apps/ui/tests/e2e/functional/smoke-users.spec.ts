// Smoke: users — add user modal open/cancel, KYC tier filter, search, row click detail sheet.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('users smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'users');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Switch to End users tab
  const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
  await expect(endUsersTab).toBeVisible({ timeout: 8_000 });
  await endUsersTab.click();

  // Add user modal: open → fill → cancel
  const addUserBtn = page.locator('button', { hasText: /add user/i });
  await expect(addUserBtn).toBeEnabled({ timeout: 5_000 });
  await addUserBtn.click();

  const modal = page.locator('[role="dialog"], .modal').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  // Fill email field
  const emailInput = modal.locator(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]'
  );
  if (await emailInput.count()) await emailInput.fill('smoke@test.com');

  // Cancel
  const cancelBtn = modal.locator('button', { hasText: /cancel/i });
  if (await cancelBtn.count()) {
    await cancelBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  // Filter: KYC tier
  const kycFilter = page.locator('.filter-btn, button, select', { hasText: /kyc|tier/i });
  if (await kycFilter.count()) await expect(kycFilter.first()).toBeVisible({ timeout: 5_000 });

  // Search input
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]');
  if (await searchInput.count()) {
    await searchInput.first().fill('test');
    await page.waitForTimeout(500);
    await searchInput.first().clear();
  }

  // Click 1 user row (if any) → detail sheet open → close via icon-btn[aria-label="Close"]
  await page.waitForTimeout(1_500);
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.count()) {
    // Use force:true to bypass TanStack Query devtools SVG overlay in dev mode
    await firstRow.click({ force: true });
    const sheet = page.locator('.sheet').first();
    if (await sheet.isVisible()) {
      const closeBtn = sheet.locator('button[aria-label="Close"]');
      if (await closeBtn.count()) {
        await closeBtn.first().click({ force: true });
      } else {
        await page.locator('.scrim').click({ force: true });
      }
      await expect(sheet).not.toBeVisible({ timeout: 5_000 });
    }
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
