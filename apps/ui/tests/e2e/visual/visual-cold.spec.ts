// Visual regression — Cold storage page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('cold storage full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'cold');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"], [class*="cold"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('cold.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
