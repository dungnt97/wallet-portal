// Visual regression — Deposits page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('deposits full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'deposits');

  // Wait for deposits table or empty state
  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('deposits.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
