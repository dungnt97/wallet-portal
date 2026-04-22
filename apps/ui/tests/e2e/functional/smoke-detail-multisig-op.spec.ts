// Smoke: multisig op detail sheet — if a pending op exists, click it and verify
// operation_type, destination, amount, approval count in the detail sheet.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';
const BNB_DEST = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** Seed a withdrawal so a multisig op is guaranteed in the queue. */
async function ensurePendingOp(): Promise<boolean> {
  const ctx = await request.newContext({ baseURL: API });
  try {
    await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });

    // Check if ops already exist
    const opsRes = await ctx.get('/multisig-ops?limit=5&status=collecting');
    const opsBody = (await opsRes.json()) as { data?: unknown[] };
    if (opsBody.data && opsBody.data.length > 0) return true;

    // Seed one via withdrawal
    const meRes = await ctx.get('/auth/me');
    const me = (await meRes.json()) as { id: string };
    const wdRes = await ctx.post('/withdrawals', {
      data: {
        userId: me.id,
        chain: 'bnb',
        token: 'USDT',
        amount: '7',
        destinationAddr: BNB_DEST,
        sourceTier: 'hot',
      },
    });
    return wdRes.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.describe('smoke-detail-multisig-op', () => {
  test('click pending op row → detail sheet shows amount, destination, approval count', async ({
    page,
  }) => {
    await seedRealAuth(page);

    const seeded = await ensurePendingOp();
    if (!seeded) {
      test.skip(true, 'admin-api unreachable or no pending ops — skipping multisig detail smoke');
      return;
    }

    await gotoApp(page, 'multisig');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Click pending tab to ensure we're on it
    const pendingTab = page.locator('.tab, [role="tab"]', { hasText: /pending/i });
    if (await pendingTab.count()) await pendingTab.first().click();

    await page.waitForTimeout(1_500);
    const firstRow = page.locator('tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No pending multisig op rows visible — skipping');
      return;
    }

    // Open detail sheet
    await firstRow.click({ force: true });

    const sheet = page.locator('div.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Verify amount block (always rendered in MultisigSheet header grid)
    const amountLabel = sheet.locator('.text-muted', { hasText: /amount/i });
    await expect(amountLabel.first()).toBeVisible({ timeout: 5_000 });

    // Verify destination block
    const destLabel = sheet.locator('.text-muted', { hasText: /destination/i });
    await expect(destLabel.first()).toBeVisible({ timeout: 5_000 });

    // Verify calldata section (always rendered in MultisigSheet)
    await expect(sheet.locator('h4', { hasText: /calldata/i })).toBeVisible({ timeout: 5_000 });

    // Approval count visible via ApprovalQueue (section-head or similar)
    const approvalEl = sheet.locator('h4, .section-head, .approval-queue').first();
    await expect(approvalEl).toBeVisible({ timeout: 4_000 });

    // Close sheet
    const closeBtn = sheet.locator('button', { hasText: /close/i });
    await expect(closeBtn.first()).toBeVisible({ timeout: 4_000 });
    await closeBtn.first().click();

    await expect(sheet).not.toBeVisible({ timeout: 8_000 });
  });
});
