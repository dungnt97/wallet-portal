// Visual regression — Withdrawals page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('withdrawals full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'withdrawals');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('withdrawals.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
