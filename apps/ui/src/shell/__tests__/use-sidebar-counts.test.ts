// Tests for use-sidebar-counts.ts — badge counts hook with socket-driven invalidation.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCounts } from '../use-sidebar-counts';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));

vi.mock('@/api/queries', () => ({
  useNavCounts: vi.fn(() => ({ data: undefined })),
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
});

// ── useSidebarCounts ──────────────────────────────────────────────────────────

describe('useSidebarCounts', () => {
  it('returns all-null counts when data is not yet loaded', async () => {
    const { useNavCounts } = await import('@/api/queries');
    vi.mocked(useNavCounts).mockReturnValue({ data: undefined } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSidebarCounts(), { wrapper });
    expect(result.current.deposits).toBeNull();
    expect(result.current.sweep).toBeNull();
    expect(result.current.withdrawals).toBeNull();
    expect(result.current.multisig).toBeNull();
    expect(result.current.recovery).toBeNull();
  });

  it('returns correct counts when data is available', async () => {
    const { useNavCounts } = await import('@/api/queries');
    vi.mocked(useNavCounts).mockReturnValue({
      data: { deposits: 3, sweep: 7, withdrawals: 2, multisig: 5, recovery: 1 },
    } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSidebarCounts(), { wrapper });
    expect(result.current.deposits).toBe(3);
    expect(result.current.sweep).toBe(7);
    expect(result.current.withdrawals).toBe(2);
    expect(result.current.multisig).toBe(5);
    expect(result.current.recovery).toBe(1);
  });

  it('subscribes to deposit.credited on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSidebarCounts(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('deposit.credited');
  });

  it('subscribes to withdrawal.created on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSidebarCounts(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('withdrawal.created');
  });

  it('subscribes to sweep.created on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSidebarCounts(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('sweep.created');
  });

  it('invalidates nav-counts cache when deposit.credited fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSidebarCounts(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'deposit.credited');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('nav-counts'))).toBe(true);
  });

  it('invalidates nav-counts cache when withdrawal.created fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSidebarCounts(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.created');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('unsubscribes from all events on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSidebarCounts(), { wrapper });
    unmount();
    const subscribedEvents = mockSocket.on.mock.calls.map((c) => c[0]);
    const unsubscribedEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    for (const evt of subscribedEvents) {
      expect(unsubscribedEvents).toContain(evt);
    }
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSidebarCounts(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
