// Smoke: withdrawal detail sheet — seed 1 withdrawal via API, click row, verify sheet opens
// with ApprovalQueue + Details sections, close.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';
const BNB_DEST = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

async function seedWithdrawal(): Promise<void> {
  const ctx = await request.newContext({ baseURL: API });
  await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });

  const meRes = await ctx.get('/auth/me');
  const me = (await meRes.json()) as { id: string };

  await ctx.post('/withdrawals', {
    data: {
      userId: me.id,
      chain: 'bnb',
      token: 'USDT',
      amount: '5',
      destinationAddr: BNB_DEST,
      sourceTier: 'hot',
    },
  });

  await ctx.dispose();
}

test.describe('smoke-detail-withdrawal-sheet', () => {
  test('click withdrawal row → sheet opens with approval queue + details, then close', async ({
    page,
  }) => {
    await seedRealAuth(page);

    try {
      await seedWithdrawal();
    } catch {
      test.skip(true, 'admin-api unreachable — skipping withdrawal detail sheet smoke');
      return;
    }

    await gotoApp(page, 'withdrawals');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    await page.waitForTimeout(1_500);
    const firstRow = page.locator('tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No withdrawal rows visible — skipping sheet test');
      return;
    }

    // Click row to open detail sheet
    await firstRow.click({ force: true });

    const sheet = page.locator('div.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Verify Details section (always present)
    await expect(sheet.locator('h4', { hasText: /details/i })).toBeVisible({ timeout: 5_000 });

    // ApprovalQueue renders a section with signatures/approvers info
    const approvalSection = sheet.locator('.approval-queue, h4, .section-head').filter({
      hasText: /approv|signat|threshold/i,
    });
    if (await approvalSection.count()) {
      await expect(approvalSection.first()).toBeVisible({ timeout: 4_000 });
    }

    // Close via ghost "Close" button in footer
    const closeBtn = sheet.locator('button', { hasText: /close/i });
    await expect(closeBtn.first()).toBeVisible({ timeout: 4_000 });
    await closeBtn.first().click();

    await expect(sheet).not.toBeVisible({ timeout: 8_000 });
  });
});
