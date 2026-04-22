// Smoke UX: toast content verification.
// 1. Success path — "Send test" on notifs page → toast.success "Test sent to active channels"
// 2. Error path  — add channel with invalid URL → inline validation error (not toast).
//    The channel form shows an inline ".text-xs" error for invalid URLs, so we
//    validate that instead of a toast (toast only fires after server rejection).
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test.describe('smoke-ux-toast-content', () => {
  test('send-test button triggers success toast with expected text', async ({ page }) => {
    await seedRealAuth(page);
    await gotoApp(page, 'notifs');

    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // "Send test" page-level button (not per-row zap icon)
    const sendTestBtn = page.locator('button.btn', { hasText: /send test/i }).first();

    if (!(await sendTestBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Send test button not visible — no channels configured');
      return;
    }

    // Check at least one active channel exists; if not, skip gracefully
    const channels = page.locator('.ch-row');
    const channelCount = await channels.count();
    if (channelCount === 0) {
      test.skip(true, 'No channels configured — send-test toast path requires at least one');
      return;
    }

    await sendTestBtn.click();

    // Modal opens: "Send test" dialog
    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Submit the test send
    const submitBtn = modal.locator('button.btn-accent').first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await submitBtn.click();

    // Success toast: "Test sent to active channels"
    const successToast = page.locator('.toast.success');
    await expect(successToast).toBeVisible({ timeout: 10_000 });
    await expect(successToast).toContainText(/test sent/i);
  });

  test('add channel with invalid URL shows inline validation error', async ({ page }) => {
    await seedRealAuth(page);
    await gotoApp(page, 'notifs');

    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Open add channel modal
    const addBtn = page.locator('button', { hasText: /add channel/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Select Slack kind
    const slackTab = modal.locator('#ch-kind-buttons button', { hasText: /slack/i });
    await expect(slackTab).toBeVisible({ timeout: 3_000 });
    await slackTab.click();

    // Fill name
    await modal.locator('#ch-name-input').fill('Test channel invalid');

    // Enter an invalid URL
    await modal.locator('#ch-target-input').fill('not-a-valid-url');

    // Submit
    const submitBtn = modal.locator('button.btn-accent').first();
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Inline validation error must appear (not a toast)
    const inlineErr = modal.locator('.text-xs', { hasText: /valid.*url|https/i });
    await expect(inlineErr).toBeVisible({ timeout: 5_000 });

    // Modal stays open — no success toast
    await expect(modal).toBeVisible();
    await expect(page.locator('.toast.success')).not.toBeVisible();

    // Close modal
    const cancelBtn = modal.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.count()) await cancelBtn.click();
    else await page.keyboard.press('Escape');

    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
