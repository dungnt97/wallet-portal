/**
 * Testnet flow: BNB sweep batch creation and on-chain execution
 *
 * Pre-condition: at least one BNB deposit is in 'credited' state.
 * This test mints a fresh deposit and waits for credit before triggering sweep
 * so it is fully self-contained and repeatable.
 *
 * Steps:
 *   1. Mint 50 tUSDT → user deposit address; poll until 'credited'
 *   2. Record Safe balance before sweep
 *   3. Navigate to /app/sweep, click "Run sweep" / "Scan now"
 *   4. Capture the sweep batch ID from the UI or API response
 *   5. Poll /sweeps/:id until status = 'confirmed'
 *   6. Assert on-chain: Safe balance decreased by swept amount (minus gas)
 *   7. Assert deposit status transitioned to 'swept'
 *   8. Assert UI sweep batch history table shows the batch with confirmed status
 *   9. Assert gas usage is within sane bounds (< 0.01 tBNB per sweep tx)
 */
import { expect } from '@playwright/test';
import { formatEther, parseUnits } from 'ethers';

import { pollDepositByTxHash, pollSweepById } from '../fixtures/testnet-api-poller.js';
import { gotoApp, test } from '../fixtures/testnet-auth-fixture.js';
import {
  getBnbTokenBalance,
  mintBnbTestToken,
  waitForBnbConfirmation,
} from '../fixtures/testnet-chain-client.js';

const DEPOSIT_AMOUNT_HUMAN = '50';
const TOKEN_DECIMALS = 18;
const MAX_GAS_BNB = 0.01; // tBNB — any sweep burning more than this is a bug

test.describe('Testnet: BNB sweep batch flow', () => {
  test.setTimeout(300_000); // 5 min — deposit credit (2 min) + sweep confirm (2 min)

  test('sweep batch executes on-chain and deposits transition to swept', async ({
    page,
    tnEnv,
    bnbClient,
  }) => {
    // ── 1. Create a credited deposit to sweep ─────────────────────────────────
    await gotoApp(page, 'deposits');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    const addressLocator = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator).toBeVisible({ timeout: 15_000 });
    const userAddress = (await addressLocator.textContent())?.trim() ?? '';
    expect(userAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const mintTxHash = await mintBnbTestToken(
      bnbClient.wallet,
      tnEnv.usdtBnbAddress,
      userAddress,
      DEPOSIT_AMOUNT_HUMAN,
      TOKEN_DECIMALS
    );
    console.log(`[sweep-bnb] Deposit mint tx: ${mintTxHash}`);

    await waitForBnbConfirmation(bnbClient.provider, mintTxHash, 3, 90_000);

    const deposit = await pollDepositByTxHash(
      page,
      tnEnv.adminApiUrl,
      mintTxHash,
      'credited',
      120_000,
      5_000
    );
    console.log(`[sweep-bnb] Deposit ${deposit.id} credited. Triggering sweep...`);

    // ── 2. Record Safe BNB balance before sweep ───────────────────────────────
    const safeBalanceBefore = await bnbClient.provider.getBalance(tnEnv.safeAddressBnb);
    console.log(`[sweep-bnb] Safe balance before: ${formatEther(safeBalanceBefore)} tBNB`);

    // ── 3. Navigate to sweep page and trigger a sweep ─────────────────────────
    await gotoApp(page, 'sweep');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    // Look for "Run sweep", "Scan now", or "Create sweep" button
    const sweepBtn = page
      .locator('button')
      .filter({ hasText: /run sweep|scan now|create sweep|sweep now/i })
      .first();
    await expect(sweepBtn).toBeVisible({ timeout: 10_000 });
    await sweepBtn.click();

    // Confirm modal if one appears
    const confirmBtn = page
      .locator('[role="dialog"] button, .modal button')
      .filter({ hasText: /confirm|execute|proceed/i })
      .first();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    // ── 4. Capture sweep batch ID ─────────────────────────────────────────────
    // The UI either shows a toast with the sweep ID or navigates to the batch.
    // Fallback: poll /sweeps?status=pending for the newest batch.
    let sweepId: string | null = null;

    // Try to get sweep ID from a data attribute on the latest batch row
    await page.waitForTimeout(2_000);
    const batchRow = page
      .locator('[data-testid="sweep-batch-row"], tr.sweep-row, .batch-row')
      .first();
    if (await batchRow.isVisible({ timeout: 5_000 })) {
      sweepId = await batchRow.getAttribute('data-id');
    }

    // Fallback: query API for newest sweep
    if (!sweepId) {
      const resp = await page
        .context()
        .request.get(`${tnEnv.adminApiUrl}/sweeps?chain=bnb&status=pending&limit=1`);
      if (resp.ok()) {
        const body = (await resp.json()) as { data: Array<{ id: string }> };
        sweepId = body.data[0]?.id ?? null;
      }
    }

    expect(sweepId, 'Could not determine sweep batch ID').toBeTruthy();
    console.log(`[sweep-bnb] Sweep batch id=${sweepId}`);

    // ── 5. Poll until sweep is confirmed on-chain ─────────────────────────────
    const sweep = await pollSweepById(
      page,
      tnEnv.adminApiUrl,
      // biome-ignore lint/style/noNonNullAssertion: sweepId is set before this block — required by Playwright flow
      sweepId!,
      'confirmed',
      180_000 // 3 min
    );
    expect(sweep.txHash).toBeTruthy();
    console.log(
      `[sweep-bnb] Sweep confirmed. txHash=${sweep.txHash}` +
        `\n  Explorer: https://testnet.bscscan.com/tx/${sweep.txHash}`
    );

    // ── 6. Assert on-chain Safe balance decreased (gas consumed) ──────────────
    const safeBalanceAfter = await bnbClient.provider.getBalance(tnEnv.safeAddressBnb);
    const gasBurned = safeBalanceBefore - safeBalanceAfter;
    const gasBurnedBnb = Number(formatEther(gasBurned));
    console.log(`[sweep-bnb] Gas burned: ${gasBurnedBnb} tBNB`);

    // Safe balance should have decreased (gas cost), but not by more than MAX_GAS_BNB
    expect(gasBurnedBnb).toBeGreaterThan(0);
    expect(gasBurnedBnb).toBeLessThan(MAX_GAS_BNB);

    // ── 7. Assert deposit status transitioned to 'swept' ─────────────────────
    const updatedDeposit = await page
      .context()
      .request.get(`${tnEnv.adminApiUrl}/deposits/${deposit.id}`);
    expect(updatedDeposit.ok()).toBe(true);
    const depositBody = (await updatedDeposit.json()) as { status: string };
    expect(depositBody.status).toBe('swept');
    console.log(`[sweep-bnb] Deposit ${deposit.id} status: ${depositBody.status}`);

    // ── 8. Assert UI sweep batch history table ────────────────────────────────
    await page.reload();
    await gotoApp(page, 'sweep');

    const confirmedRow = page
      .locator('[data-testid="sweep-batch-row"], tr, .batch-row')
      .filter({ hasText: sweepId?.slice(0, 8) })
      .first();
    await expect(confirmedRow).toBeVisible({ timeout: 15_000 });

    const statusCell = confirmedRow.locator('.badge, [data-status], .status').first();
    await expect(statusCell).toContainText(/confirmed/i, { timeout: 5_000 });

    // ── 9. Assert gas monitor reflects consumed gas ───────────────────────────
    const gasMonitor = page.locator('[data-testid="gas-monitor"], .gas-monitor').first();
    if (await gasMonitor.isVisible()) {
      const gasText = await gasMonitor.textContent();
      console.log(`[sweep-bnb] Gas monitor text: ${gasText}`);
      // Should contain a BNB value — not empty
      expect(gasText).toMatch(/\d/);
    }
  });
});
