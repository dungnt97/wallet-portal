// Tests for use-ops-socket.ts — subscribes to ops.killswitch.changed, invalidates cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpsSocket } from '../use-ops-socket';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));

vi.mock('@/components/overlays', () => ({
  useToast: vi.fn(() => vi.fn()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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

// ── useOpsSocket ──────────────────────────────────────────────────────────────

describe('useOpsSocket', () => {
  it('subscribes to ops.killswitch.changed on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useOpsSocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('ops.killswitch.changed');
  });

  it('invalidates ops cache when ops.killswitch.changed fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useOpsSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'ops.killswitch.changed');
    call?.[1]({ enabled: true, reason: 'test', updatedAt: new Date().toISOString() });
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('ops'))).toBe(true);
  });

  it('calls toast when kill switch fires', async () => {
    const mockToast = vi.fn();
    const { useToast } = await import('@/components/overlays');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useOpsSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'ops.killswitch.changed');
    call?.[1]({ enabled: false, reason: null, updatedAt: new Date().toISOString() });
    expect(mockToast).toHaveBeenCalled();
  });

  it('unsubscribes from ops.killswitch.changed on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useOpsSocket(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('ops.killswitch.changed');
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useOpsSocket(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
