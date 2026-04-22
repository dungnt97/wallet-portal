// Smoke: multisig — BNB+SOL vault cards, treasurer team, tab switch, sync button.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('multisig smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'multisig');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // BNB + SOL vault cards
  const vaultCards = page.locator('.card', { hasText: /BSC|Solana|Safe|Squads/i });
  await expect(vaultCards.first()).toBeVisible({ timeout: 10_000 });

  // Treasurer team section visible
  const teamSection = page.locator('.card, .pro-card', { hasText: /treasurer|team|signer/i });
  if (await teamSection.count()) await expect(teamSection.first()).toBeVisible({ timeout: 6_000 });

  // Tab switch: Pending → Failed
  const pendingTab = page.locator('.tab, [role="tab"]', { hasText: /pending/i });
  if (await pendingTab.count()) await pendingTab.first().click();

  const failedTab = page.locator('.tab, [role="tab"]', { hasText: /failed/i });
  if (await failedTab.count()) await failedTab.first().click();

  // Back to pending
  if (await pendingTab.count()) await pendingTab.first().click();

  // Sync / retry button visible ("Thử lại" in VI, "Retry" / "Sync" in EN)
  const syncBtn = page.locator('button', { hasText: /retry|sync|thử lại/i });
  await expect(syncBtn.first()).toBeVisible({ timeout: 8_000 });
  // Click it if enabled
  if (!(await syncBtn.first().isDisabled())) await syncBtn.first().click();

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
