// Visual regression — Reconciliation page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('reconciliation full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'recon');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"], [class*="recon"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('reconciliation.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
