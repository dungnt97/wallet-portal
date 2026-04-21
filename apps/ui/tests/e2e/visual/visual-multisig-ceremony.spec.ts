// Visual regression — Multisig ceremony page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('multisig ceremony full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'multisig');

  await page
    .waitForSelector(
      'table, [class*="empty"], [class*="Empty"], [class*="multisig"], [class*="ceremony"]',
      { timeout: 10_000 }
    )
    .catch(() => {});

  await expect(page).toHaveScreenshot('multisig-ceremony.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
