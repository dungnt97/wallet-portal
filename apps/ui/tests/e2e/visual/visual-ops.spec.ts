// Visual regression — Ops page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('ops full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'ops');

  await page
    .waitForSelector('[class*="ops"], [class*="Ops"], main, [role="main"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('ops.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
