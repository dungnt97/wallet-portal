// Visual regression — Users page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('users full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'users');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('users.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="timestamp"]')],
  });
});
