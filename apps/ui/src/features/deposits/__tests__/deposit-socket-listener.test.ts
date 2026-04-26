// Tests for deposits/socket-listener.ts — useDepositSocketListener hook.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDepositSocketListener } from '../socket-listener';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
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

// ── useDepositSocketListener ──────────────────────────────────────────────────

describe('useDepositSocketListener', () => {
  it('subscribes to deposit.credited on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useDepositSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('deposit.credited');
  });

  it('invalidates deposits cache when deposit.credited fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useDepositSocketListener(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'deposit.credited');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('deposits'))).toBe(true);
  });

  it('invalidates dashboard cache when deposit.credited fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useDepositSocketListener(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'deposit.credited');
    call?.[1]();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('dashboard'))).toBe(true);
  });

  it('unsubscribes from deposit.credited on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useDepositSocketListener(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('deposit.credited');
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useDepositSocketListener(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
