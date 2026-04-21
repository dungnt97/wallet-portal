// Visual regression — Signers page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('signers full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'signers');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"], [class*="signer"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('signers.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
