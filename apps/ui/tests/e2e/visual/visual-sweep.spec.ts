// Visual regression — Sweep page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('sweep full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'sweep');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('sweep.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
