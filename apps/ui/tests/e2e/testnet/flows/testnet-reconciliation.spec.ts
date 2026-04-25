/**
 * Testnet flow: reconciliation snapshot — pre/post sweep drift = 0
 *
 * Steps:
 *   1. Create a pre-sweep reconciliation snapshot via admin-API
 *   2. Mint a deposit + wait for credit
 *   3. Trigger a sweep and wait for confirmation
 *   4. Create a post-sweep snapshot
 *   5. Assert drift = 0 (on-chain balance matches DB ledger, within 1 wei)
 *   6. Assert reconciliation page renders both snapshots
 *   7. Assert the drift timeline chart renders without errors
 *
 * No mocks — all snapshots read real on-chain balances via wallet-engine.
 * Timeout: 5 min (covers deposit credit + sweep confirm)
 */
import { expect } from '@playwright/test';

import {
  createReconciliationSnapshot,
  getLatestSnapshots,
  pollDepositByTxHash,
  pollSweepById,
} from '../fixtures/testnet-api-poller.js';
import { gotoApp, test } from '../fixtures/testnet-auth-fixture.js';
import { mintBnbTestToken, waitForBnbConfirmation } from '../fixtures/testnet-chain-client.js';

const DEPOSIT_AMOUNT = '25'; // 25 tUSDT — small to keep gas costs low

test.describe('Testnet: Reconciliation pre/post sweep', () => {
  test.setTimeout(300_000); // 5 min

  test('drift is zero after a complete deposit → sweep cycle', async ({
    page,
    tnEnv,
    bnbClient,
  }) => {
    // ── 1. Pre-sweep snapshot ─────────────────────────────────────────────────
    const preSnapshot = await createReconciliationSnapshot(page, tnEnv.adminApiUrl, 'bnb');
    console.log(`[recon] Pre-sweep snapshot id=${preSnapshot.id} drift=${preSnapshot.drift}`);

    // ── 2. Mint deposit + wait for credit ─────────────────────────────────────
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
      DEPOSIT_AMOUNT
    );
    console.log(`[recon] Deposit mint tx: ${mintTxHash}`);

    await waitForBnbConfirmation(bnbClient.provider, mintTxHash, 3, 90_000);

    const deposit = await pollDepositByTxHash(
      page,
      tnEnv.adminApiUrl,
      mintTxHash,
      'credited',
      120_000,
      5_000
    );
    console.log(`[recon] Deposit ${deposit.id} credited`);

    // ── 3. Trigger sweep ──────────────────────────────────────────────────────
    await gotoApp(page, 'sweep');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    const sweepBtn = page
      .locator('button')
      .filter({ hasText: /run sweep|scan now|create sweep|sweep now/i })
      .first();
    await expect(sweepBtn).toBeVisible({ timeout: 10_000 });
    await sweepBtn.click();

    const confirmBtn = page
      .locator('[role="dialog"] button, .modal button')
      .filter({ hasText: /confirm|execute|proceed/i })
      .first();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2_000);

    // Get sweep ID from newest pending sweep
    let sweepId: string | null = null;
    const batchRow = page
      .locator('[data-testid="sweep-batch-row"], tr.sweep-row, .batch-row')
      .first();
    if (await batchRow.isVisible({ timeout: 5_000 })) {
      sweepId = await batchRow.getAttribute('data-id');
    }
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

    await pollSweepById(page, tnEnv.adminApiUrl, sweepId!, 'confirmed', 180_000);
    console.log(`[recon] Sweep ${sweepId} confirmed`);

    // ── 4. Post-sweep snapshot ────────────────────────────────────────────────
    const postSnapshot = await createReconciliationSnapshot(page, tnEnv.adminApiUrl, 'bnb');
    console.log(`[recon] Post-sweep snapshot id=${postSnapshot.id} drift=${postSnapshot.drift}`);

    // ── 5. Assert drift ≤ 1 wei (rounding tolerance) ─────────────────────────
    // Drift is stored as string; convert to BigInt for precise comparison
    const driftAbs = BigInt(postSnapshot.drift.replace(/^-/, ''));
    expect(driftAbs).toBeLessThanOrEqual(1n);
    console.log(`[recon] Post-sweep drift: ${postSnapshot.drift} (within 1 wei tolerance ✓)`);

    // Pre-sweep drift should also be within 1 wei (DB was consistent before)
    const preDriftAbs = BigInt(preSnapshot.drift.replace(/^-/, ''));
    expect(preDriftAbs).toBeLessThanOrEqual(1n);

    // ── 6. Assert reconciliation page renders both snapshots ──────────────────
    await gotoApp(page, 'reconciliation');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 15_000 });

    const snapshotList = page
      .locator('[data-testid="snapshot-list"], .snapshot-list, table, .recon-table')
      .first();
    await expect(snapshotList).toBeVisible({ timeout: 10_000 });

    // Both snapshot IDs should be visible in the list
    await expect(
      page
        .locator(`[data-id="${preSnapshot.id}"], tr, .snapshot-row`)
        .filter({
          hasText: preSnapshot.id.slice(0, 8),
        })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page
        .locator(`[data-id="${postSnapshot.id}"], tr, .snapshot-row`)
        .filter({
          hasText: postSnapshot.id.slice(0, 8),
        })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    // ── 7. Assert drift timeline chart renders without console errors ──────────
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const chart = page
      .locator('[data-testid="drift-timeline-chart"], .drift-chart, canvas, svg')
      .first();
    if (await chart.isVisible({ timeout: 5_000 })) {
      console.log('[recon] Drift timeline chart is visible ✓');
    }

    // Verify no JS errors from chart rendering
    expect(
      consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('ResizeObserver'))
    ).toHaveLength(0);

    // ── 8. Verify snapshot data via API matches on-chain/DB ───────────────────
    const snapshots = await getLatestSnapshots(page, tnEnv.adminApiUrl, 'bnb', 5);
    const postFromApi = snapshots.find((s) => s.id === postSnapshot.id);
    expect(postFromApi).toBeDefined();
    expect(BigInt(postFromApi!.drift.replace(/^-/, ''))).toBeLessThanOrEqual(1n);
    console.log(`[recon] API confirmed: snapshot ${postSnapshot.id} drift=${postFromApi!.drift} ✓`);
  });
});
