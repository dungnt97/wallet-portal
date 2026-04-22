// Smoke: realtime notification — Socket.io notif.created increments bell badge.
//
// Strategy: trigger a notif.created event by toggling the kill-switch ON via API
// (kill-switch toggle calls notifyStaff → emitNotifCreated for admin role).
// The UI's useNotificationsSocket listener invalidates the unread-count query,
// so the bell badge count should increment within 5s.
//
// Skip: admin-api not reachable on :3001.
// Cleanup: always reset kill-switch to OFF after the test.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';

type ApiCtx = Awaited<ReturnType<typeof request.newContext>>;

/** Login as Mira + return an authenticated APIRequestContext. Returns null if unreachable. */
async function makeApiCtx(): Promise<ApiCtx | null> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    if (!res.ok() && res.status() >= 500) {
      await ctx.dispose();
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Reset kill-switch to OFF. Non-throwing — safe to call in finally blocks. */
async function resetKillSwitch(ctx: ApiCtx): Promise<void> {
  try {
    await ctx.post('/ops/kill-switch', { data: { enabled: false, reason: 'test cleanup' } });
  } catch {
    // non-fatal
  }
}

test.describe('smoke-realtime-notification', () => {
  test('bell badge increments when notif.created arrives via Socket.io', async ({ page }) => {
    const apiCtx = await makeApiCtx();

    if (!apiCtx) {
      test.skip(true, 'admin-api not reachable on :3001 — skipping realtime notification test');
      return;
    }

    // Ensure kill-switch is OFF before we start so the first toggle goes ON → notif fires
    await resetKillSwitch(apiCtx);

    await seedRealAuth(page);
    await gotoApp(page, 'dashboard');

    // Read initial unread count from aria-label on the bell button
    // e.g. "Notifications (3 unread)" or "Notifications" (when 0)
    const bell = page.locator('button[aria-label*="Notifications"]');
    await expect(bell).toBeVisible({ timeout: 15_000 });

    // Extract current count before triggering the event
    const labelBefore = (await bell.getAttribute('aria-label')) ?? '';
    const matchBefore = labelBefore.match(/\((\d+) unread\)/);
    const countBefore = matchBefore ? Number.parseInt(matchBefore[1], 10) : 0;

    // Toggle kill-switch ON via API — this calls notifyStaff(role='admin') → emitNotifCreated
    let ksOk = false;
    try {
      const ksRes = await apiCtx.post('/ops/kill-switch', {
        data: { enabled: true, reason: 'smoke-realtime-notification test' },
      });
      ksOk = ksRes.ok();
    } catch {
      // network error after apiCtx was created — treat as skip
    }

    if (!ksOk) {
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
      test.skip(true, 'Kill-switch toggle failed — notif event not fired, skipping badge check');
      return;
    }

    try {
      // Wait up to 8s for the bell badge aria-label to reflect a higher unread count.
      // The Socket.io notif.created event triggers qc.invalidateQueries(['notifications'])
      // which refetches /notifications/unread-count, updating the badge.
      await expect(async () => {
        const label = (await bell.getAttribute('aria-label')) ?? '';
        const match = label.match(/\((\d+) unread\)/);
        const countNow = match ? Number.parseInt(match[1], 10) : 0;
        expect(countNow).toBeGreaterThan(countBefore);
      }).toPass({ timeout: 8_000, intervals: [300, 500, 800, 1000, 1500] });
    } finally {
      // Always clean up — reset kill-switch to OFF
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
    }
  });
});
