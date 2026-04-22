// Smoke: notification channel CRUD — add Slack channel (invalid URL → error, fix → row),
// then delete it via trash icon → row removed.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const CHANNEL_NAME = `Test Slack ${Date.now()}`;

test.describe('smoke-form-notif-channel', () => {
  test.beforeEach(async ({ page }) => {
    await seedRealAuth(page);
  });

  test('add Slack channel: invalid URL → error; fix → row; delete → row removed', async ({
    page,
  }) => {
    await gotoApp(page, 'notifs');

    const addBtn = page.locator('button', { hasText: /add channel/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Select Slack kind
    await modal.locator('#ch-kind-buttons button', { hasText: /slack/i }).click();

    // Fill name
    await modal.locator('#ch-name-input').fill(CHANNEL_NAME);

    // 1. Invalid URL target → submit → inline error
    await modal.locator('#ch-target-input').fill('not-a-url');

    const submitBtn = modal.locator('button.btn-accent');
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Inline error "Enter a valid https:// URL" should appear
    const inlineErr = modal.locator('.text-xs', { hasText: /valid.*url|https/i });
    await expect(inlineErr).toBeVisible({ timeout: 5_000 });

    // Modal still open
    await expect(modal).toBeVisible();

    // 2. Fix target → valid Slack webhook URL
    await modal.locator('#ch-target-input').clear();
    await modal.locator('#ch-target-input').fill('https://hooks.slack.com/test');

    // Severity — info (default; click explicitly)
    const infoRadio = modal.locator('#ch-severity-group input[value="info"]');
    await infoRadio.evaluate((el) => (el as HTMLInputElement).click());

    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Modal closes on success
    await expect(modal).not.toBeVisible({ timeout: 12_000 });

    // Success toast
    await expect(page.locator('.toast.success')).toBeVisible({ timeout: 10_000 });

    // New channel row appears
    const newRow = page.locator('.ch-row', { hasText: CHANNEL_NAME });
    await expect(newRow).toBeVisible({ timeout: 10_000 });

    // 3. Delete the row — trash is the 3rd icon-btn (zap, pencil, trash)
    const rowBtns = newRow.locator('.icon-btn');
    const btnCount = await rowBtns.count();
    const trashBtn = rowBtns.nth(Math.min(2, btnCount - 1));
    await trashBtn.click();

    // Row disappears
    await expect(newRow).not.toBeVisible({ timeout: 10_000 });
  });
});
