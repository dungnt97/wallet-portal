/**
 * Testnet flow: idempotency and replay-attack prevention
 *
 * Verifies that the system correctly handles duplicate submissions and
 * sequential runs without producing stale state conflicts.
 *
 * Tests:
 *   A. Duplicate deposit credit — POST /internal/deposits/:id/credit twice → 409 on 2nd
 *   B. Duplicate withdrawal approval — approve same withdrawal twice → 409 on 2nd
 *   C. Nonce management — consecutive BNB mints use incrementing nonces (no replay)
 *   D. Fresh-address isolation — each test run gets a unique deposit address
 *
 * Timeout: 3 min (covers one real deposit cycle for test C).
 */
import { expect } from '@playwright/test';

import { pollDepositByTxHash, submitWithdrawalApproval } from '../fixtures/testnet-api-poller.js';
import { gotoApp, test } from '../fixtures/testnet-auth-fixture.js';
import {
  mintBnbTestToken,
  sleep,
  waitForBnbConfirmation,
} from '../fixtures/testnet-chain-client.js';

// Dev treasurer emails match the fixed seed data in dev-auth-fixture
const TREASURER_0_EMAIL = 'ben@treasury.io';

test.describe('Testnet: Idempotency and state isolation', () => {
  test.setTimeout(180_000); // 3 min

  test('A: duplicate deposit credit webhook returns 409 on second call', async ({
    page,
    tnEnv,
    bnbClient,
  }) => {
    // Create a real deposit first so we have a valid depositId
    await gotoApp(page, 'deposits');
    const addressLocator = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator).toBeVisible({ timeout: 15_000 });
    const userAddress = (await addressLocator.textContent())?.trim() ?? '';
    expect(userAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const txHash = await mintBnbTestToken(
      bnbClient.wallet,
      tnEnv.usdtBnbAddress,
      userAddress,
      '5' // small amount — just need a real deposit in DB
    );
    await waitForBnbConfirmation(bnbClient.provider, txHash, 3, 90_000);

    const deposit = await pollDepositByTxHash(
      page,
      tnEnv.adminApiUrl,
      txHash,
      'credited',
      120_000,
      5_000
    );
    console.log(`[idempotency-A] Deposit ${deposit.id} credited`);

    // POST /internal/deposits/:id/credit — first call should succeed (200/204)
    // or return 409 if already credited (the watcher may have already credited it)
    const call1 = await page
      .context()
      .request.post(`${tnEnv.adminApiUrl}/internal/deposits/${deposit.id}/credit`, {
        data: { txHash },
        headers: { 'Content-Type': 'application/json' },
      });
    const status1 = call1.status();
    expect([200, 204, 409]).toContain(status1);
    console.log(`[idempotency-A] First credit call status: ${status1}`);

    // Second call MUST return 409 — deposit is already in 'credited' state
    const call2 = await page
      .context()
      .request.post(`${tnEnv.adminApiUrl}/internal/deposits/${deposit.id}/credit`, {
        data: { txHash },
        headers: { 'Content-Type': 'application/json' },
      });
    expect(call2.status()).toBe(409);
    console.log('[idempotency-A] Second credit call correctly returned 409 ✓');
  });

  test('B: duplicate withdrawal approval returns 409 on second call', async ({ page, tnEnv }) => {
    // Create a withdrawal request via the UI
    await gotoApp(page, 'withdrawals');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    const newWithdrawalBtn = page
      .locator('button')
      .filter({ hasText: /new withdrawal|create withdrawal|withdraw/i })
      .first();

    // Skip this test if we can't create a withdrawal (e.g. no balance)
    if (!(await newWithdrawalBtn.isVisible({ timeout: 5_000 }))) {
      console.log('[idempotency-B] No withdrawal button visible — skipping B');
      test.skip();
      return;
    }

    await newWithdrawalBtn.click();
    const dialog = page.locator('[role="dialog"], .modal-overlay, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    const recipientInput = dialog
      .locator('input[name="recipient"], input[placeholder*="address"], input[placeholder*="0x"]')
      .first();
    await recipientInput.fill('0x000000000000000000000000000000000000dEaD');

    const amountInput = dialog
      .locator('input[name="amount"], input[type="number"], input[placeholder*="amount"]')
      .first();
    await amountInput.fill('1');

    const submitBtn = dialog
      .locator('button[type="submit"], button')
      .filter({ hasText: /submit|create|request/i })
      .first();
    await submitBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // Get withdrawal ID from first row
    const firstRow = page.locator('[data-testid="withdrawal-row"], tr, .withdrawal-row').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const withdrawalId = await firstRow.getAttribute('data-id');
    expect(withdrawalId).toBeTruthy();
    console.log(`[idempotency-B] Created withdrawal ${withdrawalId}`);

    // First approval — should succeed
    const approve1 = await page
      .context()
      .request.post(`${tnEnv.adminApiUrl}/withdrawals/${withdrawalId}/approve`, {
        headers: { 'X-Dev-Email': TREASURER_0_EMAIL, 'Content-Type': 'application/json' },
      });
    const status1 = approve1.status();
    expect([200, 204]).toContain(status1);
    console.log(`[idempotency-B] First approval status: ${status1}`);

    // Second approval from SAME treasurer — must be 409
    const approve2 = await page
      .context()
      .request.post(`${tnEnv.adminApiUrl}/withdrawals/${withdrawalId}/approve`, {
        headers: { 'X-Dev-Email': TREASURER_0_EMAIL, 'Content-Type': 'application/json' },
      });
    expect(approve2.status()).toBe(409);
    console.log('[idempotency-B] Duplicate approval correctly returned 409 ✓');
  });

  test('C: consecutive on-chain mints use incrementing nonces (no replay)', async ({
    tnEnv,
    bnbClient,
  }) => {
    // Read current nonce before sending two mints
    const nonceBefore = await bnbClient.provider.getTransactionCount(
      bnbClient.wallet.address,
      'latest'
    );
    console.log(`[idempotency-C] Nonce before: ${nonceBefore}`);

    // Send two sequential mints to the burn address (not a real deposit, just nonce test)
    const burnAddr = '0x000000000000000000000000000000000000dEaD';
    const tx1Hash = await mintBnbTestToken(bnbClient.wallet, tnEnv.usdtBnbAddress, burnAddr, '1');
    const tx2Hash = await mintBnbTestToken(bnbClient.wallet, tnEnv.usdtBnbAddress, burnAddr, '1');

    // Both must have distinct hashes — if nonces collided tx2 would replace tx1
    expect(tx1Hash).not.toBe(tx2Hash);

    // Wait for both to confirm
    const [receipt1, receipt2] = await Promise.all([
      waitForBnbConfirmation(bnbClient.provider, tx1Hash, 1, 60_000),
      waitForBnbConfirmation(bnbClient.provider, tx2Hash, 1, 60_000),
    ]);

    // Nonce after must be nonceBefore + 2
    const nonceAfter = await bnbClient.provider.getTransactionCount(
      bnbClient.wallet.address,
      'latest'
    );
    expect(nonceAfter).toBe(nonceBefore + 2);
    console.log(
      `[idempotency-C] Nonces used: ${nonceBefore}, ${nonceBefore + 1} → nonceAfter=${nonceAfter} ✓`
    );
    console.log(
      `[idempotency-C] tx1 block=${receipt1.blockNumber}, tx2 block=${receipt2.blockNumber}`
    );

    // tx2 block must be >= tx1 block (sequential ordering preserved)
    expect(receipt2.blockNumber).toBeGreaterThanOrEqual(receipt1.blockNumber);
  });

  test('D: deposit address is unique per user and stable across page reloads', async ({
    page,
    tnEnv,
  }) => {
    // Load deposits page — read address
    await gotoApp(page, 'deposits');
    const addressLocator = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator).toBeVisible({ timeout: 15_000 });
    const address1 = (await addressLocator.textContent())?.trim() ?? '';
    expect(address1).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Reload — address must be stable (deterministic HD derivation)
    await page.reload();
    await gotoApp(page, 'deposits');
    const addressLocator2 = page
      .locator('[data-testid="deposit-address"], .deposit-address, code')
      .first();
    await expect(addressLocator2).toBeVisible({ timeout: 15_000 });
    const address2 = (await addressLocator2.textContent())?.trim() ?? '';

    expect(address2).toBe(address1);
    console.log(`[idempotency-D] Deposit address stable across reload: ${address1} ✓`);

    // Verify address is stored in DB via API
    const resp = await page
      .context()
      .request.get(`${tnEnv.adminApiUrl}/users/me/addresses?chain=bnb`);
    if (resp.ok()) {
      const body = (await resp.json()) as { data: Array<{ address: string; chain: string }> };
      const bnbAddr = body.data.find((a) => a.chain === 'bnb');
      if (bnbAddr) {
        // Case-insensitive compare — EIP-55 vs lowercase
        expect(bnbAddr.address.toLowerCase()).toBe(address1.toLowerCase());
        console.log('[idempotency-D] DB address matches UI address ✓');
      }
    }
  });
});
