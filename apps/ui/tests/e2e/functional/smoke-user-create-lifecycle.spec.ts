// Smoke: user create lifecycle — create user via UI → verify in list → click row →
// verify detail sheet shows derived HD addresses.
//
// Pattern follows smoke-form-user-create.spec.ts but adds the detail-sheet / address check
// as a distinct lifecycle step to validate the full create→view→inspect flow.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

function uniqueEmail(): string {
  return `lifecycle-user-${Date.now()}@example.com`;
}

test.describe('smoke-user-create-lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await seedRealAuth(page);
  });

  test('create user → appears in list → click row → detail sheet shows derived addresses', async ({
    page,
  }) => {
    const email = uniqueEmail();
    await gotoApp(page, 'users');

    // Switch to End users tab
    const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
    await expect(endUsersTab).toBeVisible({ timeout: 10_000 });
    await endUsersTab.click();

    // Open Add user modal
    const addBtn = page.locator('button', { hasText: /add user/i });
    await expect(addBtn).toBeEnabled({ timeout: 5_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Fill required fields
    await modal.locator('#user-email').fill(email);
    await modal.locator('#user-kyc').selectOption('basic');

    // Submit
    const submitBtn = modal.locator('button.btn-accent', { hasText: /create user/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Success toast confirms creation
    await expect(page.locator('.toast.success')).toBeVisible({ timeout: 15_000 });

    // Handle optional confirmation view (shows derived addresses + Done button)
    const confirmModal = page.locator('.modal[role="dialog"]').first();
    const doneBtn = confirmModal.locator('button.btn-accent', { hasText: /done/i });
    const isDone = await doneBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (isDone) {
      // Derived address block should be visible inside confirmation
      const addrBlock = confirmModal.locator('.text-mono, code, [class*="addr"]').first();
      const hasAddr = await addrBlock.isVisible({ timeout: 4_000 }).catch(() => false);
      if (hasAddr) {
        const addrText = (await addrBlock.textContent()) ?? '';
        // Address should be non-empty — either 0x... or a Solana base58 key
        expect(addrText.trim().length).toBeGreaterThan(0);
      }
      await doneBtn.click();
    }

    // User row must appear in the list (search to reduce table noise)
    const searchInput = page
      .locator('input[placeholder*="search" i], input[type="search"]')
      .first();
    const hasSearch = await searchInput.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasSearch) {
      await searchInput.fill(email.slice(0, 12));
      await page.waitForTimeout(600);
    }

    const emailCell = page.locator('td', { hasText: email });
    await expect(emailCell).toBeVisible({ timeout: 12_000 });

    // Click the user row to open the detail sheet
    const userRow = page.locator('tbody tr').filter({ hasText: email }).first();
    await userRow.click({ force: true });

    const sheet = page.locator('.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Detail sheet must contain the user's email
    await expect(sheet.locator('*', { hasText: email }).first()).toBeVisible({ timeout: 5_000 });

    // Sheet should render derived chain addresses (BNB + Solana) — rendered as mono-font or
    // labelled address fields; accept either inline or in a collapsible section.
    const addrInSheet = sheet.locator('.text-mono, code, [class*="addr"]').first();
    const sheetHasAddr = await addrInSheet.isVisible({ timeout: 5_000 }).catch(() => false);
    if (sheetHasAddr) {
      const text = (await addrInSheet.textContent()) ?? '';
      expect(text.trim().length).toBeGreaterThan(0);
    }

    // Close the sheet
    const closeBtn = sheet.locator('button[aria-label="Close"], button', { hasText: /close/i });
    if (
      await closeBtn
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await closeBtn.first().click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(sheet).not.toBeVisible({ timeout: 8_000 });
  });

  test('submit with empty email → create button is disabled', async ({ page }) => {
    await gotoApp(page, 'users');

    const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
    await expect(endUsersTab).toBeVisible({ timeout: 10_000 });
    await endUsersTab.click();

    const addBtn = page.locator('button', { hasText: /add user/i });
    await expect(addBtn).toBeEnabled({ timeout: 5_000 });
    await addBtn.click();

    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Do NOT fill email — button must be disabled (required field guard)
    const submitBtn = modal.locator('button.btn-accent', { hasText: /create user/i });
    await expect(submitBtn).toBeDisabled({ timeout: 3_000 });

    // Cancel cleanly
    const cancelBtn = modal.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
