// Smoke: realtime kill-switch — Socket.io ops.killswitch.changed propagates across tabs.
//
// Strategy: open two independent browser contexts (tab A = /app/ops, tab B = /app/ops).
// Tab A toggles kill-switch ON via the UI. The server emits ops.killswitch.changed to
// all connected /stream clients. Tab B's useOpsSocket listener invalidates ['ops'] query
// → KillSwitchCard refetches → banner appears in tab B without any action from tab B.
// Then toggle OFF from tab A — tab B banner disappears within 5s.
//
// Skip: admin-api not reachable on :3001.
// Cleanup: always reset kill-switch to OFF after the suite.
import { expect, request, test } from '@playwright/test';
import { gotoApp, seedRealAuth } from '../support/real-api-fixture';

const API = 'http://localhost:3001';

/** Reset kill-switch; swallows errors so setUp/tearDown never crash the runner. */
async function resetKillSwitch(enabled = false): Promise<void> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });
    await ctx.post('/ops/kill-switch', { data: { enabled, reason: 'test cleanup' } });
    await ctx.dispose();
  } catch {
    // non-fatal — admin-api may be down; test body will skip itself
  }
}

/** Returns true when admin-api responds to /health (or any 2xx/4xx on dev-login). */
async function isApiReachable(): Promise<boolean> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    await ctx.dispose();
    return res.ok() || res.status() < 500;
  } catch {
    return false;
  }
}

test.describe('smoke-realtime-killswitch', () => {
  test.beforeEach(async () => {
    await resetKillSwitch(false);
  });

  test.afterAll(async () => {
    await resetKillSwitch(false);
  });

  test('kill-switch toggle ON in tab A propagates banner to tab B via Socket.io', async ({
    browser,
  }) => {
    if (!(await isApiReachable())) {
      test.skip(true, 'admin-api not reachable on :3001 — skipping realtime killswitch test');
      return;
    }

    // Create two independent contexts so each gets its own Socket.io connection
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Both tabs start on /app/ops and authenticate
      await seedRealAuth(pageA);
      await seedRealAuth(pageB);
      await gotoApp(pageA, 'ops');
      await gotoApp(pageB, 'ops');

      // Both tabs: wait for kill-switch card to be visible (socket is connected)
      const ksCardA = pageA.locator('.card', { hasText: /kill switch|outbound/i }).first();
      const ksCardB = pageB.locator('.card', { hasText: /kill switch|outbound/i }).first();
      await expect(ksCardA).toBeVisible({ timeout: 12_000 });
      await expect(ksCardB).toBeVisible({ timeout: 12_000 });

      // Tab B: banner must NOT be visible yet (kill-switch is OFF)
      const bannerB = pageB.locator('.policy-strip', { hasText: /outbound paused/i });
      await expect(bannerB).not.toBeVisible({ timeout: 3_000 });

      // Tab A: click toggle → confirm modal → fill reason → confirm
      const toggleA = pageA.locator('.toggle').first();
      await expect(toggleA).toBeVisible({ timeout: 8_000 });
      await toggleA.click();

      const modalA = pageA.locator('.modal-backdrop .modal').first();
      await expect(modalA).toBeVisible({ timeout: 5_000 });

      const reasonInput = modalA.locator('#ks-reason');
      await reasonInput.fill('smoke-realtime-killswitch tab-A ON');

      const confirmBtn = modalA.locator('button.btn-danger');
      await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
      await confirmBtn.click();

      // Tab A: modal closes, banner appears
      await expect(modalA).not.toBeVisible({ timeout: 8_000 });
      const bannerA = pageA.locator('.policy-strip', { hasText: /outbound paused/i });
      await expect(bannerA).toBeVisible({ timeout: 8_000 });

      // Tab B: banner appears via Socket.io ops.killswitch.changed → ['ops'] invalidation
      await expect(bannerB).toBeVisible({ timeout: 8_000 });

      // Tab A: toggle OFF → confirm modal
      await toggleA.click();
      const modalA2 = pageA.locator('.modal-backdrop .modal').first();
      await expect(modalA2).toBeVisible({ timeout: 5_000 });

      const confirmOff = modalA2.locator('button.btn-primary');
      await expect(confirmOff).toBeEnabled({ timeout: 3_000 });
      await confirmOff.click();

      await expect(modalA2).not.toBeVisible({ timeout: 8_000 });
      await expect(bannerA).not.toBeVisible({ timeout: 8_000 });

      // Tab B: banner also disappears via socket update
      await expect(bannerB).not.toBeVisible({ timeout: 8_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
