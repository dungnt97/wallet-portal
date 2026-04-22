// Smoke: user create — fill Add user modal, submit, assert toast + row + HD addresses.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

function uniqueEmail() {
  return `testuser-${Date.now()}@example.com`;
}

test.describe('smoke-form-user-create', () => {
  test.beforeEach(async ({ page }) => {
    await seedRealAuth(page);
  });

  test('create user → toast success → row in list', async ({ page }) => {
    const email = uniqueEmail();
    await gotoApp(page, 'users');

    // Switch to End users tab
    const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
    await expect(endUsersTab).toBeVisible({ timeout: 10_000 });
    await endUsersTab.click();

    // Open modal
    const addBtn = page.locator('button', { hasText: /add user/i });
    await expect(addBtn).toBeEnabled({ timeout: 5_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Fill form
    await modal.locator('#user-email').fill(email);
    await modal.locator('#user-kyc').selectOption('basic');

    // Submit
    const submitBtn = modal.locator('button.btn-accent', { hasText: /create user/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Success toast
    await expect(page.locator('.toast.success')).toBeVisible({ timeout: 15_000 });

    // If confirmation view with addresses appears, verify address and click Done
    const confirmModal = page.locator('.modal[role="dialog"]').first();
    const isDone = await confirmModal
      .locator('button.btn-accent', { hasText: /done/i })
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (isDone) {
      // HD addresses block visible
      const addrBlock = confirmModal.locator('.text-mono').first();
      await expect(addrBlock).toBeVisible({ timeout: 5_000 });
      await confirmModal.locator('button.btn-accent', { hasText: /done/i }).click();
    }

    // New row should appear in list
    await expect(page.locator('td', { hasText: email })).toBeVisible({ timeout: 12_000 });
  });
});
