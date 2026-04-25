/**
 * Testnet flow: BNB deposit detection → credited
 *
 * Steps:
 *   1. Login as admin (seeded in fixture)
 *   2. Navigate to /app/deposits and grab user deposit address
 *   3. Mint 100 tUSDT from deployer wallet → user deposit address (real on-chain tx)
 *   4. Wait for 3-block confirmation on Chapel (~9s)
 *   5. Poll admin-API until deposit.status = 'credited' (watcher + job ~36s)
 *   6. Assert UI table row shows the deposit with correct amount + status
 *   7. Assert on-chain balance of deposit address matches minted amount
 *
 * Does NOT use mocks. All RPC calls hit real BNB Chapel testnet.
 * Timeout: 3 min (generous for Chapel's variable block time + job queue).
 */
import { expect } from '@playwright/test';
import { parseUnits } from 'ethers';

import { test, gotoApp } from '../fixtures/testnet-auth-fixture.js';
import {
  mintBnbTestToken,
  waitForBnbConfirmation,
  getBnbTokenBalance,
  formatTokenAmount,
} from '../fixtures/testnet-chain-client.js';
import { pollDepositByTxHash } from '../fixtures/testnet-api-poller.js';
import { isValidBnbAddress } from '../fixtures/testnet-env.js';

// Amount to deposit per test run — small enough to be cheap, big enough to be meaningful
const DEPOSIT_AMOUNT_HUMAN = '100';
const TOKEN_DECIMALS = 18;

test.describe('Testnet: BNB deposit detection flow', () => {
  test.setTimeout(180_000); // 3 min — watcher + 12-block confirm + job

  test('minted tUSDT is detected, confirmed, and credited in the UI', async ({
    page,
    tnEnv,
    bnbClient,
  }) => {
    // ── 1. Navigate to deposits page ─────────────────────────────────────────
    await gotoApp(page, 'deposits');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    // ── 2. Read user deposit address from UI ─────────────────────────────────
    // The UI renders the user's deposit address under data-testid="deposit-address"
    // or similar. We wait for it to be non-empty.
    const addressLocator = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator).toBeVisible({ timeout: 15_000 });
    const userAddress = (await addressLocator.textContent())?.trim() ?? '';

    expect(isValidBnbAddress(userAddress), `Expected valid BNB address, got: ${userAddress}`)
      .toBe(true);
    console.log(`[deposit-bnb] User deposit address: ${userAddress}`);

    // ── 3. Record pre-deposit on-chain balance ────────────────────────────────
    const balanceBefore = await getBnbTokenBalance(
      bnbClient.provider,
      tnEnv.usdtBnbAddress,
      userAddress
    );
    console.log(
      `[deposit-bnb] Balance before: ${formatTokenAmount(balanceBefore, TOKEN_DECIMALS)} tUSDT`
    );

    // ── 4. Mint 100 tUSDT on-chain → user deposit address ────────────────────
    const txHash = await mintBnbTestToken(
      bnbClient.wallet,
      tnEnv.usdtBnbAddress,
      userAddress,
      DEPOSIT_AMOUNT_HUMAN,
      TOKEN_DECIMALS
    );
    console.log(`[deposit-bnb] Mint tx broadcast: ${txHash}`);
    console.log(`[deposit-bnb] Explorer: https://testnet.bscscan.com/tx/${txHash}`);

    // ── 5. Wait for 3-block on-chain confirmation ─────────────────────────────
    const receipt = await waitForBnbConfirmation(
      bnbClient.provider,
      txHash,
      3,   // 3 blocks ≈ 9s on Chapel
      90_000
    );
    console.log(
      `[deposit-bnb] Confirmed at block=${receipt.blockNumber}, gasUsed=${receipt.gasUsed}`
    );

    // ── 6. Poll admin-API until deposit reaches 'credited' ───────────────────
    // The wallet-engine watcher polls every ~3s, then enqueues deposit-confirm
    // which waits 12 blocks (~36s total from tx broadcast). Allow 2 min.
    const deposit = await pollDepositByTxHash(
      page,
      tnEnv.adminApiUrl,
      txHash,
      'credited',
      120_000, // 2 min
      5_000    // start polling 5s after tx confirm
    );

    expect(deposit.txHash).toBe(txHash);
    expect(deposit.chain).toMatch(/bnb/i);
    expect(deposit.token).toMatch(/usdt/i);
    // Amount may be stored as string "100.000000000000000000" or "100"
    expect(parseFloat(deposit.amount)).toBeCloseTo(100, 0);

    // ── 7. Assert UI table shows the credited deposit ─────────────────────────
    await page.reload();
    await gotoApp(page, 'deposits');

    // Look for the deposit row by tx hash — the table should have a link or cell
    const txCell = page
      .locator(`[data-testid="deposit-row"], tr, .deposit-row`)
      .filter({ hasText: txHash.slice(0, 10) }) // first 10 chars of hash
      .first();
    await expect(txCell).toBeVisible({ timeout: 15_000 });

    // Status badge should show 'credited'
    const statusBadge = txCell.locator('.badge, [data-status], .status').first();
    await expect(statusBadge).toContainText(/credited/i, { timeout: 5_000 });

    // ── 8. Assert on-chain balance increased by exactly the deposit amount ────
    const balanceAfter = await getBnbTokenBalance(
      bnbClient.provider,
      tnEnv.usdtBnbAddress,
      userAddress
    );
    const diff = balanceAfter - balanceBefore;
    const expectedDiff = parseUnits(DEPOSIT_AMOUNT_HUMAN, TOKEN_DECIMALS);
    expect(diff).toBe(expectedDiff);
    console.log(
      `[deposit-bnb] Balance after: ${formatTokenAmount(balanceAfter, TOKEN_DECIMALS)} tUSDT (+${formatTokenAmount(diff, TOKEN_DECIMALS)})`
    );
  });
});
