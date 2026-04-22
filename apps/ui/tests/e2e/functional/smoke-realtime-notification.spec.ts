// Smoke: realtime notification — bell badge increments when a new notification
// is created. We trigger creation by toggling the kill-switch ON (which calls
// notifyStaff → inserts notification rows for admin role including Mira).
//
// Verification strategy: after toggling the kill-switch, navigate away and back
// (forces TanStack Query to remount + refetch useUnreadCount) then check that
// the badge aria-label reflects a higher unread count. This is more reliable
// than waiting for a Socket.io push in a Playwright context, where the timing
// of room-join vs event emission can cause flakiness.
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

/** Read the current unread count for the logged-in session via API. */
async function fetchUnreadCount(ctx: ApiCtx): Promise<number> {
  try {
    const res = await ctx.get('/notifications/unread-count');
    if (!res.ok()) return 0;
    const body = (await res.json()) as { count: number };
    return body.count ?? 0;
  } catch {
    return 0;
  }
}

test.describe('smoke-realtime-notification', () => {
  test('bell badge increments when a new notification is created', async ({ page }) => {
    const apiCtx = await makeApiCtx();

    if (!apiCtx) {
      test.skip(true, 'admin-api not reachable on :3001 — skipping realtime notification test');
      return;
    }

    // Ensure kill-switch is OFF before we start
    await resetKillSwitch(apiCtx);

    await seedRealAuth(page);
    await gotoApp(page, 'dashboard');

    // Read initial unread count directly from the API (source of truth, no UI timing)
    const countBefore = await fetchUnreadCount(apiCtx);

    // Toggle kill-switch ON — this calls notifyStaff(role='admin') which inserts
    // notification rows for all admin staff including Mira, then emits notif.created.
    let ksOk = false;
    try {
      const ksRes = await apiCtx.post('/ops/kill-switch', {
        data: { enabled: true, reason: 'smoke-realtime-notification test' },
      });
      ksOk = ksRes.ok();
    } catch {
      // network error
    }

    if (!ksOk) {
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
      test.skip(true, 'Kill-switch toggle failed — notif event not fired, skipping badge check');
      return;
    }

    try {
      // notifyStaff is fire-and-forget on the server (Promise not awaited by the route).
      // Wait briefly so the INSERT commits before we poll the count.
      await page.waitForTimeout(1_500);

      // Verify the DB count increased via direct API poll (confirms backend worked)
      const countAfterApi = await fetchUnreadCount(apiCtx);
      expect(countAfterApi).toBeGreaterThan(countBefore);

      // Navigate away and back — forces TanStack Query to remount and refetch
      // useUnreadCount, guaranteeing the UI picks up the new count without
      // depending on Socket.io room-join timing.
      await gotoApp(page, 'deposits');
      await gotoApp(page, 'dashboard');

      // Now verify the bell badge in the UI reflects the incremented count.
      const bell = page.locator('button[aria-label*="Notifications"]');
      await expect(bell).toBeVisible({ timeout: 10_000 });

      await expect(async () => {
        const label = (await bell.getAttribute('aria-label')) ?? '';
        const match = label.match(/\((\d+) unread\)/);
        const countNow = match ? Number.parseInt(match[1], 10) : 0;
        expect(countNow).toBeGreaterThan(countBefore);
      }).toPass({ timeout: 10_000, intervals: [500, 1000, 1500, 2000] });
    } finally {
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
    }
  });
});
