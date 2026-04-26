// Tests for use-notifications-socket.ts — connects with staffId, subscribes to
// notif.created, invalidates cache, toasts on critical severity.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationsSocket } from '../use-notifications-socket';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  io: { opts: { query: undefined as Record<string, string> | undefined } },
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
}));

vi.mock('@/auth/use-auth', () => ({
  useAuth: vi.fn(() => ({ staff: { id: 'staff-001', name: 'Test User' } })),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: vi.fn(() => vi.fn()),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client: qc, children }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset socket opts
  mockSocket.io.opts.query = undefined;
});

// ── useNotificationsSocket ────────────────────────────────────────────────────

describe('useNotificationsSocket', () => {
  it('does not call connectSocket when staff is null', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: null } as never);
    const { connectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('calls getSocket and connectSocket when staff is present', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { connectSocket, getSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    expect(getSocket).toHaveBeenCalled();
    expect(connectSocket).toHaveBeenCalled();
  });

  it('sets staffId on socket opts when not already set', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-42' } } as never);
    mockSocket.io.opts.query = undefined;
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    expect((mockSocket.io.opts.query as Record<string, string>)?.staffId).toBe('staff-42');
  });

  it('does not overwrite staffId when already set', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-99' } } as never);
    mockSocket.io.opts.query = { staffId: 'staff-existing' };
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    expect(mockSocket.io.opts.query.staffId).toBe('staff-existing');
  });

  it('subscribes to notif.created on mount', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('notif.created');
  });

  it('invalidates notifications cache when notif.created fires', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useNotificationsSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'notif.created');
    call?.[1]({ id: 'n-1', title: 'test', severity: 'info' });
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('notifications'))).toBe(true);
  });

  it('calls toast on critical severity notification', async () => {
    const mockToast = vi.fn();
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { useToast } = await import('@/components/overlays/toast-host');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'notif.created');
    call?.[1]({ id: 'n-2', title: 'ALERT', severity: 'critical' });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('ALERT'), 'error');
  });

  it('does not call toast for non-critical notifications', async () => {
    const mockToast = vi.fn();
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { useToast } = await import('@/components/overlays/toast-host');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'notif.created');
    call?.[1]({ id: 'n-3', title: 'Info', severity: 'info' });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('unsubscribes from notif.created on unmount', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useNotificationsSocket(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('notif.created');
  });

  it('calls disconnectSocket on unmount', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: { id: 'staff-001' } } as never);
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useNotificationsSocket(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
