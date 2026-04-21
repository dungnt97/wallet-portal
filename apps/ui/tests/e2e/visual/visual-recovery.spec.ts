// Visual regression — Recovery page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('recovery full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'recovery');

  await page
    .waitForSelector('[class*="recovery"], [class*="Recovery"], main, [role="main"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('recovery.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
