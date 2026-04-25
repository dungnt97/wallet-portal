/**
 * Testnet flow: Solana deposit detection → credited
 *
 * Steps:
 *   1. Login as admin (seeded in fixture)
 *   2. Navigate to /app/deposits, switch to Solana tab, grab user deposit address
 *   3. Ensure deployer has enough SOL (airdrop if not)
 *   4. Mint 50 tUSDC SPL tokens from deployer → user Solana deposit address (real on-chain tx)
 *   5. Wait for Devnet confirmation (~1-2s)
 *   6. Poll admin-API until deposit.status = 'credited' (watcher ~2s + 32-slot confirm ~8s)
 *   7. Assert UI table row shows deposit with correct amount + status
 *   8. Assert on-chain SPL token balance of deposit address matches minted amount
 *
 * Does NOT use mocks. All calls hit real Solana Devnet.
 * Timeout: 2 min (Devnet is faster than BNB Chapel but can be rate-limited).
 */
import { expect } from '@playwright/test';

import { test, gotoApp } from '../fixtures/testnet-auth-fixture.js';
import {
  mintSplToken,
  waitForSolConfirmation,
  getSplTokenBalance,
  airdropSolIfNeeded,
} from '../fixtures/testnet-chain-client.js';
import { pollDepositByTxHash } from '../fixtures/testnet-api-poller.js';
import { isValidSolAddress } from '../fixtures/testnet-env.js';

// 50 tUSDC with 6 decimals
const DEPOSIT_AMOUNT_RAW = 50n * 10n ** 6n;
const DEPOSIT_AMOUNT_HUMAN = '50';
const TOKEN_DECIMALS = 6;

test.describe('Testnet: Solana deposit detection flow', () => {
  test.setTimeout(120_000); // 2 min — Devnet is faster than Chapel

  test('minted tUSDC SPL token is detected, confirmed, and credited in the UI', async ({
    page,
    tnEnv,
    solClient,
  }) => {
    // ── 1. Navigate to deposits page ─────────────────────────────────────────
    await gotoApp(page, 'deposits');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    // ── 2. Switch to Solana chain tab ─────────────────────────────────────────
    const solTab = page
      .locator('[role="tab"], .tab, button')
      .filter({ hasText: /solana|sol/i })
      .first();
    if (await solTab.isVisible()) {
      await solTab.click();
      await page.waitForTimeout(500);
    }

    // ── 3. Read user Solana deposit address from UI ───────────────────────────
    const addressLocator = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator).toBeVisible({ timeout: 15_000 });
    const userAddress = (await addressLocator.textContent())?.trim() ?? '';

    expect(
      isValidSolAddress(userAddress),
      `Expected valid Solana base58 address, got: "${userAddress}"`
    ).toBe(true);
    console.log(`[deposit-sol] User Solana deposit address: ${userAddress}`);

    // ── 4. Ensure deployer has sufficient SOL for rent + transfer fees ─────────
    await airdropSolIfNeeded(
      solClient.connection,
      solClient.deployer.publicKey,
      0.1 * 1e9 // 0.1 SOL minimum
    );

    // ── 5. Record pre-deposit SPL balance ─────────────────────────────────────
    const balanceBefore = await getSplTokenBalance(
      solClient.connection,
      tnEnv.usdcSolMint,
      userAddress
    );
    console.log(
      `[deposit-sol] Balance before: ${Number(balanceBefore) / 10 ** TOKEN_DECIMALS} tUSDC`
    );

    // ── 6. Mint 50 tUSDC directly to user deposit address ─────────────────────
    // Deployer is mint authority — mintSplToken creates ATA if needed
    const txSig = await mintSplToken(
      solClient.connection,
      solClient.deployer,
      tnEnv.usdcSolMint,
      userAddress,
      DEPOSIT_AMOUNT_RAW
    );
    console.log(`[deposit-sol] Mint tx signature: ${txSig}`);
    console.log(
      `[deposit-sol] Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`
    );

    // ── 7. Wait for Devnet confirmation ───────────────────────────────────────
    await waitForSolConfirmation(solClient.connection, txSig, 30_000);
    console.log(`[deposit-sol] Transaction confirmed on Devnet`);

    // ── 8. Poll admin-API until deposit reaches 'credited' ────────────────────
    // Solana watcher polls every ~2s; confirm depth 32 slots ≈ 8s total
    const deposit = await pollDepositByTxHash(
      page,
      tnEnv.adminApiUrl,
      txSig,
      'credited',
      90_000,  // 90s timeout
      3_000    // start polling 3s after confirmation
    );

    expect(deposit.txHash).toBe(txSig);
    expect(deposit.chain).toMatch(/sol/i);
    expect(deposit.token).toMatch(/usdc/i);
    expect(parseFloat(deposit.amount)).toBeCloseTo(parseFloat(DEPOSIT_AMOUNT_HUMAN), 0);

    // ── 9. Assert UI table shows the credited deposit ─────────────────────────
    await page.reload();
    await gotoApp(page, 'deposits');

    // Switch back to Solana tab after reload
    const solTabAfter = page
      .locator('[role="tab"], .tab, button')
      .filter({ hasText: /solana|sol/i })
      .first();
    if (await solTabAfter.isVisible()) await solTabAfter.click();

    // Find the deposit row — sig is long, match on first 10 chars
    const sigPrefix = txSig.slice(0, 10);
    const txCell = page
      .locator('[data-testid="deposit-row"], tr, .deposit-row')
      .filter({ hasText: sigPrefix })
      .first();
    await expect(txCell).toBeVisible({ timeout: 15_000 });

    const statusBadge = txCell.locator('.badge, [data-status], .status').first();
    await expect(statusBadge).toContainText(/credited/i, { timeout: 5_000 });

    // ── 10. Assert on-chain balance increased by exact mint amount ─────────────
    const balanceAfter = await getSplTokenBalance(
      solClient.connection,
      tnEnv.usdcSolMint,
      userAddress
    );
    const diff = balanceAfter - balanceBefore;
    expect(diff).toBe(DEPOSIT_AMOUNT_RAW);
    console.log(
      `[deposit-sol] Balance after: ${Number(balanceAfter) / 10 ** TOKEN_DECIMALS} tUSDC (+${Number(diff) / 10 ** TOKEN_DECIMALS})`
    );
  });
});
