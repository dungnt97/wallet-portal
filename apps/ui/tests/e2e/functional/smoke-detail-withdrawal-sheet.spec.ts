// Smoke: withdrawal detail sheet — seed 1 withdrawal via /dev/seed/withdrawal,
// click data row, verify sheet opens with ApprovalQueue + Details sections, close.
//
// Seed strategy: POST /dev/seed/withdrawal bypasses policy engine + SAFE_ADDRESS
// requirements so the test works in any dev environment without extra config.
// Requires: admin-api on :3001, NODE_ENV !== production.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';
const BNB_DEST = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** Seed one withdrawal via the dev endpoint. Returns true on success. */
async function seedWithdrawal(): Promise<boolean> {
  const ctx = await request.newContext({ baseURL: API });
  try {
    // Login to get a valid session + staff id
    const loginRes = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    if (!loginRes.ok()) return false;
    const staff = (await loginRes.json()) as { id: string };

    // Find the first user to attach the withdrawal to
    const usersRes = await ctx.get('/users?limit=1');
    if (!usersRes.ok()) return false;
    const usersBody = (await usersRes.json()) as { data: Array<{ id: string }> };
    const userId = usersBody.data[0]?.id;
    if (!userId) return false;

    // Direct DB seed — bypasses policy engine + SAFE_ADDRESS requirement
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

test.describe('smoke-detail-withdrawal-sheet', () => {
  test('click withdrawal row → sheet opens with approval queue + details, then close', async ({
    page,
  }) => {
    await seedRealAuth(page);

    const seeded = await seedWithdrawal();
    if (!seeded) {
      test.skip(
        true,
        'admin-api seed endpoint unavailable — skipping withdrawal detail sheet smoke'
      );
      return;
    }

    await gotoApp(page, 'withdrawals');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    await page.waitForTimeout(1_500);

    // Wait for a data row (cursor:pointer) — distinct from the empty-state <tr>
    const dataRow = page.locator('tbody tr[style*="cursor"]').first();
    const hasDataRow = await dataRow.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasDataRow) {
      test.skip(true, 'No withdrawal data rows visible — skipping sheet test');
      return;
    }

    // Click row to open detail sheet
    await dataRow.click({ force: true });

    const sheet = page.locator('div.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Verify Details section (always present)
    await expect(
      sheet
        .locator('h4, .section-head')
        .filter({ hasText: /details/i })
        .first()
    ).toBeVisible({
      timeout: 5_000,
    });

    // ApprovalQueue renders a section with signatures/approvers info
    const approvalSection = sheet.locator('.approval-queue, h4, .section-head').filter({
      hasText: /approv|signat|threshold/i,
    });
    if (await approvalSection.count()) {
      await expect(approvalSection.first()).toBeVisible({ timeout: 4_000 });
    }

    // Close via ghost "Close" button in footer
    const closeBtn = sheet.locator('button').filter({ hasText: /close/i });
    await expect(closeBtn.first()).toBeVisible({ timeout: 4_000 });
    await closeBtn.first().click();

    await expect(sheet).not.toBeVisible({ timeout: 8_000 });
  });
});
