// Tests for use-notifications.ts — notifKeys factory + all 6 query/mutation hooks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifKeys,
  useMarkAllRead,
  useMarkRead,
  useNotificationPrefs,
  useNotifications,
  usePatchNotificationPrefs,
  useUnreadCount,
} from '../use-notifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/notifications', () => ({
  fetchNotifications: vi.fn(),
  fetchUnreadCount: vi.fn(),
  fetchNotificationPrefs: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  patchNotificationPrefs: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client: qc, children }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── notifKeys factory ─────────────────────────────────────────────────────────

describe('notifKeys', () => {
  it('all is ["notifications"]', () => {
    expect(notifKeys.all).toEqual(['notifications']);
  });

  it('list() with no limit', () => {
    expect(notifKeys.list()).toEqual(['notifications', 'list', undefined]);
  });

  it('list() with limit', () => {
    expect(notifKeys.list(25)).toEqual(['notifications', 'list', 25]);
  });

  it('unreadCount() returns correct key', () => {
    expect(notifKeys.unreadCount()).toEqual(['notifications', 'unread-count']);
  });

  it('prefs() returns correct key', () => {
    expect(notifKeys.prefs()).toEqual(['notifications', 'prefs']);
  });
});

// ── useNotifications ──────────────────────────────────────────────────────────

describe('useNotifications', () => {
  it('fetches notifications list', async () => {
    const { fetchNotifications } = await import('@/api/notifications');
    const data = { data: [{ id: 'n1', title: 'New deposit' }], total: 1 };
    vi.mocked(fetchNotifications).mockResolvedValue(data as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('passes custom limit to fetchNotifications', async () => {
    const { fetchNotifications } = await import('@/api/notifications');
    vi.mocked(fetchNotifications).mockResolvedValue({ data: [], total: 0 } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(25), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(fetchNotifications).toHaveBeenCalledWith(25);
  });
});

// ── useUnreadCount ────────────────────────────────────────────────────────────

describe('useUnreadCount', () => {
  it('fetches unread count', async () => {
    const { fetchUnreadCount } = await import('@/api/notifications');
    vi.mocked(fetchUnreadCount).mockResolvedValue({ count: 7 } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 7 });
  });
});

// ── useNotificationPrefs ──────────────────────────────────────────────────────

describe('useNotificationPrefs', () => {
  it('fetches notification preferences', async () => {
    const { fetchNotificationPrefs } = await import('@/api/notifications');
    const prefs = { inApp: true, email: false, eventTypes: {} };
    vi.mocked(fetchNotificationPrefs).mockResolvedValue(prefs as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefs);
  });
});

// ── useMarkRead ───────────────────────────────────────────────────────────────

describe('useMarkRead', () => {
  it('calls markNotificationRead with the notification id', async () => {
    const { markNotificationRead } = await import('@/api/notifications');
    vi.mocked(markNotificationRead).mockResolvedValue({ ok: true } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync('notif-1');
    });
    expect(markNotificationRead).toHaveBeenCalledWith('notif-1');
  });

  it('starts in idle state', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    expect(result.current.status).toBe('idle');
  });
});

// ── useMarkAllRead ────────────────────────────────────────────────────────────

describe('useMarkAllRead', () => {
  it('calls markAllNotificationsRead', async () => {
    const { markAllNotificationsRead } = await import('@/api/notifications');
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ ok: true, updated: 5 } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarkAllRead(), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync();
    });
    expect(markAllNotificationsRead).toHaveBeenCalled();
  });
});

// ── usePatchNotificationPrefs ─────────────────────────────────────────────────

describe('usePatchNotificationPrefs', () => {
  it('calls patchNotificationPrefs with body', async () => {
    const { patchNotificationPrefs } = await import('@/api/notifications');
    const updated = { inApp: true, email: true, eventTypes: {} };
    vi.mocked(patchNotificationPrefs).mockResolvedValue(updated as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePatchNotificationPrefs(), { wrapper });
    const body = { email: true };
    await waitFor(async () => {
      await result.current.mutateAsync(body);
    });
    expect(patchNotificationPrefs).toHaveBeenCalledWith(body);
  });

  it('starts in idle state', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePatchNotificationPrefs(), { wrapper });
    expect(result.current.status).toBe('idle');
  });
});
