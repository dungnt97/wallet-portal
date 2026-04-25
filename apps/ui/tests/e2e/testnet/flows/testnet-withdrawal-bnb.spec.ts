/**
 * Testnet flow: BNB withdrawal — pending → approved (2-of-3) → broadcasted → confirmed
 *
 * This test exercises the full multi-sig approval path on BNB Chapel:
 *   1. Admin creates a withdrawal request via the UI form
 *   2. Treasurer-0 approves via the UI (second browser context)
 *   3. Treasurer-1 approves via the API directly (simulates second signer)
 *      → approval threshold reached → wallet-engine signs & broadcasts Safe tx
 *   4. Poll until status = 'confirmed'
 *   5. Assert on-chain: recipient received the expected tUSDT amount
 *   6. Assert UI withdrawal table shows 'confirmed' status
 *
 * Pre-condition: Safe must be funded with tUSDT (from previous deposits/sweeps
 * or direct mint in test setup). We mint a small amount to Safe directly to
 * guarantee sufficient balance regardless of prior test state.
 *
 * Timeout: 5 min — Safe tx requires 2 signatures + execution + 3-block confirm.
 */
import { expect } from '@playwright/test';
import { formatUnits, parseUnits } from 'ethers';

import { pollWithdrawalById, submitWithdrawalApproval } from '../fixtures/testnet-api-poller.js';
import {
  DEV_TREASURER_0,
  DEV_TREASURER_1,
  gotoApp,
  seedRealAuth,
  test,
} from '../fixtures/testnet-auth-fixture.js';
import {
  formatTokenAmount,
  getBnbTokenBalance,
  mintBnbTestToken,
  waitForBnbConfirmation,
} from '../fixtures/testnet-chain-client.js';

const WITHDRAWAL_AMOUNT_HUMAN = '10'; // 10 tUSDT — small but meaningful
const TOKEN_DECIMALS = 18;
// A fresh throwaway recipient address — does not need private key, just receives tokens
const RECIPIENT_ADDRESS = '0x000000000000000000000000000000000000dEaD'; // burn address for testability

test.describe('Testnet: BNB withdrawal multi-sig flow', () => {
  test.setTimeout(300_000); // 5 min

  test('withdrawal goes through 2-of-3 approval and executes on-chain', async ({
    page,
    tnEnv,
    bnbClient,
  }) => {
    // ── 1. Ensure Safe has enough tUSDT to fulfill the withdrawal ─────────────
    const safeBalanceBefore = await getBnbTokenBalance(
      bnbClient.provider,
      tnEnv.usdtBnbAddress,
      tnEnv.safeAddressBnb
    );
    console.log(
      `[withdrawal-bnb] Safe tUSDT before: ${formatTokenAmount(safeBalanceBefore, TOKEN_DECIMALS)}`
    );

    const withdrawalWei = parseUnits(WITHDRAWAL_AMOUNT_HUMAN, TOKEN_DECIMALS);
    if (safeBalanceBefore < withdrawalWei) {
      // Top up Safe directly — mint extra to cover the withdrawal + headroom
      const topUpAmount = formatUnits(withdrawalWei * 2n - safeBalanceBefore, TOKEN_DECIMALS);
      const topUpTx = await mintBnbTestToken(
        bnbClient.wallet,
        tnEnv.usdtBnbAddress,
        tnEnv.safeAddressBnb,
        topUpAmount,
        TOKEN_DECIMALS
      );
      await waitForBnbConfirmation(bnbClient.provider, topUpTx, 3, 90_000);
      console.log(`[withdrawal-bnb] Topped up Safe by ${topUpAmount} tUSDT. tx=${topUpTx}`);
    }

    // Record recipient balance before the withdrawal
    const recipientBefore = await getBnbTokenBalance(
      bnbClient.provider,
      tnEnv.usdtBnbAddress,
      RECIPIENT_ADDRESS
    );
    console.log(
      `[withdrawal-bnb] Recipient balance before: ${formatTokenAmount(recipientBefore, TOKEN_DECIMALS)} tUSDT`
    );

    // ── 2. Admin creates a withdrawal request in the UI ───────────────────────
    await gotoApp(page, 'withdrawals');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    // Open "New withdrawal" form
    const newWithdrawalBtn = page
      .locator('button')
      .filter({ hasText: /new withdrawal|create withdrawal|withdraw/i })
      .first();
    await expect(newWithdrawalBtn).toBeVisible({ timeout: 10_000 });
    await newWithdrawalBtn.click();

    const dialog = page.locator('[role="dialog"], .modal-overlay, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // Fill in recipient
    const recipientInput = dialog
      .locator('input[name="recipient"], input[placeholder*="address"], input[placeholder*="0x"]')
      .first();
    await recipientInput.fill(RECIPIENT_ADDRESS);

    // Fill in amount
    const amountInput = dialog
      .locator('input[name="amount"], input[type="number"], input[placeholder*="amount"]')
      .first();
    await amountInput.fill(WITHDRAWAL_AMOUNT_HUMAN);

    // Select BNB chain if a native <select> exists; for custom comboboxes click by text
    const chainSelect = dialog.locator('select[name="chain"]').first();
    if (await chainSelect.isVisible({ timeout: 2_000 })) {
      await chainSelect.selectOption({ label: 'BNB' });
    } else {
      // Custom combobox — click the option containing BNB/BSC text
      const chainCombo = dialog.locator('[role="combobox"]').first();
      if (await chainCombo.isVisible({ timeout: 2_000 })) {
        await chainCombo.click();
        await page
          .locator('[role="option"], li')
          .filter({ hasText: /bnb|bsc/i })
          .first()
          .click();
      }
    }

    // Select tUSDT token if a native <select> exists
    const tokenSelect = dialog.locator('select[name="token"]').first();
    if (await tokenSelect.isVisible({ timeout: 2_000 })) {
      await tokenSelect.selectOption({ label: 'tUSDT' });
    } else {
      const tokenCombo = dialog.locator('[role="combobox"]').nth(1);
      if (await tokenCombo.isVisible({ timeout: 2_000 })) {
        await tokenCombo.click();
        await page.locator('[role="option"], li').filter({ hasText: /usdt/i }).first().click();
      }
    }

    // Submit form
    const submitBtn = dialog
      .locator('button[type="submit"], button')
      .filter({ hasText: /submit|create|request/i })
      .first();
    await submitBtn.click();

    // Wait for dialog to close and success feedback
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    // ── 3. Capture the new withdrawal ID from the table ───────────────────────
    const firstRow = page.locator('[data-testid="withdrawal-row"], tr, .withdrawal-row').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const withdrawalId = await firstRow.getAttribute('data-id');
    if (!withdrawalId) throw new Error('Withdrawal row missing data-id attribute');
    console.log(`[withdrawal-bnb] Created withdrawal id=${withdrawalId}`);

    // Verify initial status is pending
    const initialStatus = firstRow.locator('.badge, [data-status], .status').first();
    await expect(initialStatus).toContainText(/pending/i, { timeout: 5_000 });

    // ── 4. Treasurer-0 approves via admin-API (simulates UI approval) ─────────
    await submitWithdrawalApproval(page, tnEnv.adminApiUrl, withdrawalId, DEV_TREASURER_0.email);
    console.log(`[withdrawal-bnb] Treasurer-0 approved withdrawal ${withdrawalId}`);

    // Status should now be 'approved' (1 of 2 required)
    await pollWithdrawalById(page, tnEnv.adminApiUrl, withdrawalId, 'approved', 30_000);

    // ── 5. Treasurer-1 approves — triggers threshold, wallet-engine executes ──
    await submitWithdrawalApproval(page, tnEnv.adminApiUrl, withdrawalId, DEV_TREASURER_1.email);
    console.log(`[withdrawal-bnb] Treasurer-1 approved withdrawal ${withdrawalId}`);

    // ── 6. Poll until 'confirmed' (Safe signs + broadcasts + 3 block confirm) ─
    const withdrawal = await pollWithdrawalById(
      page,
      tnEnv.adminApiUrl,
      withdrawalId,
      'confirmed',
      240_000 // 4 min — Safe execution can be slow on Chapel
    );

    expect(withdrawal.txHash).toBeTruthy();
    console.log(
      `[withdrawal-bnb] Withdrawal confirmed. txHash=${withdrawal.txHash}` +
        `\n  Explorer: https://testnet.bscscan.com/tx/${withdrawal.txHash}`
    );

    // ── 7. Assert recipient received the tUSDT on-chain ──────────────────────
    // Wait one more block for state to settle, then read balance
    await new Promise((r) => setTimeout(r, 5_000));
    const recipientAfter = await getBnbTokenBalance(
      bnbClient.provider,
      tnEnv.usdtBnbAddress,
      RECIPIENT_ADDRESS
    );
    const received = recipientAfter - recipientBefore;
    console.log(
      `[withdrawal-bnb] Recipient received: ${formatTokenAmount(received, TOKEN_DECIMALS)} tUSDT`
    );
    expect(received).toBe(parseUnits(WITHDRAWAL_AMOUNT_HUMAN, TOKEN_DECIMALS));

    // ── 8. Assert UI shows 'confirmed' status ─────────────────────────────────
    // Re-seed admin auth (was overwritten by treasurer sessions in submitApproval)
    await seedRealAuth(page, tnEnv.adminApiUrl);
    await page.reload();
    await gotoApp(page, 'withdrawals');

    const confirmedRow = page
      .locator('[data-testid="withdrawal-row"], tr, .withdrawal-row')
      .filter({ hasText: withdrawalId.slice(0, 8) })
      .first();
    await expect(confirmedRow).toBeVisible({ timeout: 15_000 });

    const statusBadge = confirmedRow.locator('.badge, [data-status], .status').first();
    await expect(statusBadge).toContainText(/confirmed/i, { timeout: 5_000 });

    // ── 9. Assert 2-of-3 threshold was required (no single-signer bypass) ─────
    expect(withdrawal.approvals).toBeGreaterThanOrEqual(withdrawal.requiredApprovals);
    expect(withdrawal.requiredApprovals).toBeGreaterThanOrEqual(2);
    console.log(
      `[withdrawal-bnb] Approvals: ${withdrawal.approvals}/${withdrawal.requiredApprovals} ✓`
    );
  });
});
