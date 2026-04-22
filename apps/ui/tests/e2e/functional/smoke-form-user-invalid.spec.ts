// Smoke: user create validation — empty submit → error, invalid email → error, fix → success.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

function uniqueEmail() {
  return `testuser-valid-${Date.now()}@example.com`;
}

test.describe('smoke-form-user-invalid', () => {
  test.beforeEach(async ({ page }) => {
    await seedRealAuth(page);
  });

  test('empty submit → button disabled; invalid email → validation; fix → success', async ({
    page,
  }) => {
    await gotoApp(page, 'users');

    const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
    await expect(endUsersTab).toBeVisible({ timeout: 10_000 });
    await endUsersTab.click();

    const addBtn = page.locator('button', { hasText: /add user/i });
    await expect(addBtn).toBeEnabled({ timeout: 5_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 1. Empty submit — "Create user" button must be disabled (email required)
    const submitBtn = modal.locator('button.btn-accent', { hasText: /create user/i });
    await expect(submitBtn).toBeDisabled({ timeout: 3_000 });

    // 2. Fill invalid email — button still disabled because input[type=email] rejects
    //    "notanemail" via browser constraint (value set but HTML validation fails).
    //    Playwright fill bypasses constraint UI but React state will hold invalid string.
    await modal.locator('#user-email').fill('notanemail');
    // Button becomes enabled once React state has non-empty email string, but
    // the backend will reject it. We assert the button is clickable (enabled) here
    // because the form only validates client-side emptiness — server validation fires on submit.
    // For pure client-side assertion use the disabled check for empty case above.
    // If the component does client-side email regex, button stays disabled — handle both:
    const isEnabled = await submitBtn.isEnabled({ timeout: 2_000 }).catch(() => false);
    if (isEnabled) {
      await submitBtn.click();
      // Expect either an error toast or an inline error message
      const errorVisible = await Promise.race([
        page
          .locator('.toast.error, .toast-error')
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true),
        page
          .locator('[style*="err-text"], .field-error, .alert.err')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true),
      ]).catch(() => false);
      expect(errorVisible).toBe(true);
    } else {
      // Button correctly disabled for invalid email
      await expect(submitBtn).toBeDisabled();
    }

    // 3. Fix email → submit succeeds
    await modal.locator('#user-email').clear();
    await modal.locator('#user-email').fill(uniqueEmail());
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Expect success toast
    await expect(page.locator('.toast.success')).toBeVisible({ timeout: 15_000 });

    // Close confirmation if shown
    const doneBtn = modal.locator('button.btn-accent', { hasText: /done/i });
    if (await doneBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await doneBtn.click();
    }
  });
});
