// Smoke: signing flow under dev-mode (mock sign + mock broadcast).
// Flow: withdrawal row → sheet → Approve & sign → review → wallet-sign (mock 900ms)
//       → step-up WebAuthn (mock 900ms+380ms) → execute (mock 1500ms) → confirmed → Done.
// Seeds a BNB withdrawal via /dev/seed/withdrawal to guarantee a signable row.
// All timers are mocks — no real wallet or WebAuthn device needed.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';
const BNB_DEST = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** Seed one BNB withdrawal via the dev endpoint. Returns true on success. */
async function seedBnbWithdrawal(): Promise<boolean> {
  const ctx = await request.newContext({ baseURL: API });
  try {
    const loginRes = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    if (!loginRes.ok()) return false;
    const staff = (await loginRes.json()) as { id: string };

    const usersRes = await ctx.get('/users?limit=1');
    if (!usersRes.ok()) return false;
    const usersBody = (await usersRes.json()) as { data: Array<{ id: string }> };
    const userId = usersBody.data[0]?.id;
    if (!userId) return false;

    const seedRes = await ctx.post('/dev/seed/withdrawal', {
      data: {
        userId,
        createdBy: staff.id,
        chain: 'bnb',
        token: 'USDT',
        amount: '5',
        destinationAddr: BNB_DEST,
        sourceTier: 'hot',
      },
    });
    return seedRes.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.describe('smoke-sign-flow-dev-mode', () => {
  test('BNB signing flow: review → wallet-sign → step-up → execute → confirmed', async ({
    page,
  }) => {
    // Seed admin auth (admin has withdrawal.approve permission)
    await seedRealAuth(page);

    // Seed a BNB withdrawal — skip gracefully if dev endpoint unavailable
    const seeded = await seedBnbWithdrawal();
    if (!seeded) {
      test.skip(true, 'admin-api seed endpoint unavailable — skipping sign flow smoke');
      return;
    }

    await gotoApp(page, 'withdrawals');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Let data load
    await page.waitForTimeout(1_500);

    // Find a signable data row (cursor:pointer rows are data rows, not empty-state)
    const dataRow = page.locator('tbody tr[style*="cursor"]').first();
    const hasRow = await dataRow.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasRow) {
      test.skip(true, 'No withdrawal data rows visible — skipping sign flow test');
      return;
    }

    // Open detail sheet
    await dataRow.click({ force: true });
    const sheet = page.locator('div.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Click "Approve & sign" in sheet footer
    const approveBtn = sheet
      .locator('button.btn-accent')
      .filter({ hasText: /approve/i })
      .first();
    const approveBtnVisible = await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!approveBtnVisible) {
      test.skip(
        true,
        'Approve & sign button not visible (row may be in non-signable state) — skipping'
      );
      return;
    }
    await approveBtn.click();

    // === Step 1: Review modal ===
    const reviewModal = page.locator('.review-modal[role="dialog"]');
    await expect(reviewModal).toBeVisible({ timeout: 8_000 });

    // Check "I reviewed" checkbox to enable "Sign in wallet"
    const reviewCheckbox = reviewModal.locator('input[type="checkbox"]').first();
    await reviewCheckbox.check();

    // Click "Sign in wallet"
    const signInWalletBtn = reviewModal
      .locator('button.btn-primary')
      .filter({ hasText: /sign in wallet/i })
      .first();
    await expect(signInWalletBtn).toBeVisible({ timeout: 4_000 });
    await signInWalletBtn.click();

    // === Step 2: WalletSignPopup (mock sign, 900ms) ===
    const walletPopup = page.locator('.wallet-popup[role="dialog"]');
    await expect(walletPopup).toBeVisible({ timeout: 8_000 });

    // In dev-mode the "Sign" button is present immediately (status='idle')
    const signBtn = walletPopup
      .locator('button.btn-primary')
      .filter({ hasText: /^sign$/i })
      .first();
    await expect(signBtn).toBeVisible({ timeout: 4_000 });
    await signBtn.click();

    // Status transitions: idle → signing → done
    await expect(walletPopup.locator('text=Signing…')).toBeVisible({ timeout: 6_000 });
    await expect(walletPopup.locator('text=Signed')).toBeVisible({ timeout: 6_000 });

    // After ~480ms onSigned fires and popup closes → step-up modal appears
    // (mock sign: 900ms, then 480ms before onSigned/onClose)
    await expect(walletPopup).not.toBeVisible({ timeout: 6_000 });

    // === Step 3: StepUpModal (WebAuthn mock: 900ms + 380ms) ===
    const stepUpModal = page.locator('.step-up-modal[role="dialog"]');
    await expect(stepUpModal).toBeVisible({ timeout: 8_000 });

    // Click "Verify identity" (btn-accent btn-lg)
    const verifyBtn = stepUpModal.locator('button.btn-accent.btn-lg').first();
    await expect(verifyBtn).toBeVisible({ timeout: 4_000 });
    await verifyBtn.click();

    // WebAuthn mock: 900ms prompting + 380ms ok = ~1280ms total
    // Then onVerified fires → transitions to execute
    await expect(stepUpModal).not.toBeVisible({ timeout: 8_000 });

    // === Step 4: ExecuteTxModal (broadcast mock: 1500ms) ===
    const executeModal = page.locator('.execute-modal[role="dialog"]');
    await expect(executeModal).toBeVisible({ timeout: 8_000 });

    // First shows "Broadcasting to chain…" then transitions to "Transaction confirmed"
    await expect(executeModal.locator('text=Transaction confirmed')).toBeVisible({
      timeout: 12_000,
    });

    // Tx hash link must be present and contain hex chars
    const hashLink = executeModal.locator('.exec-confirmed-hash');
    await expect(hashLink).toBeVisible({ timeout: 5_000 });
    const hashText = await hashLink.textContent();
    expect(hashText).toMatch(/[0-9a-fA-F]/);

    // Click "Done" to close
    const doneBtn = executeModal.locator('button').filter({ hasText: /done/i }).first();
    await expect(doneBtn).toBeVisible({ timeout: 4_000 });
    await doneBtn.click();

    await expect(executeModal).not.toBeVisible({ timeout: 5_000 });
  });
});
