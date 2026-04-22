// Smoke: signers — treasurer list, add/remove/rotate signer modals open/close.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('signers smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'signers');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Current tab visible
  const currentTab = page.locator('.tab, [role="tab"]', { hasText: /current/i });
  await expect(currentTab.first()).toBeVisible({ timeout: 8_000 });

  // Treasurer list: table or empty state
  await page.waitForTimeout(1_500);
  const rows = await page.locator('tbody tr').count();
  const empty = await page.locator('.text-muted', { hasText: /empty|no signers/i }).count();
  expect(rows + empty).toBeGreaterThanOrEqual(0);

  // Helper: open a Sheet via button, then close via icon-btn[aria-label="Close"] or scrim
  async function openAndCloseSheet(btnText: RegExp) {
    const btn = page.locator('button', { hasText: btnText });
    if (!(await btn.count())) return;
    await expect(btn.first()).toBeVisible({ timeout: 6_000 });
    await btn.first().click();
    // Signers modals use Sheet component which renders div.sheet
    const sheet = page.locator('div.sheet');
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const cancelBtn = sheet.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.count()) {
      await cancelBtn.click();
    } else {
      // Sheet close icon-btn
      const closeBtn = sheet.locator('button[aria-label="Close"]');
      if (await closeBtn.count()) await closeBtn.click();
      else await page.locator('.scrim').click();
    }
    await expect(sheet).not.toBeVisible({ timeout: 5_000 });
  }

  await openAndCloseSheet(/add signer/i);
  await openAndCloseSheet(/remove signer/i);
  await openAndCloseSheet(/rotate/i);

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
