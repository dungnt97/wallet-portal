// Tests for audit-socket-listener.ts — useAuditSocketListener hook.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuditSocketListener } from '../audit-socket-listener';

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

// ── useAuditSocketListener ────────────────────────────────────────────────────

describe('useAuditSocketListener', () => {
  it('subscribes to audit.created on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useAuditSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('audit.created');
  });

  it('invalidates audit cache when audit.created fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useAuditSocketListener(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'audit.created');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('audit'))).toBe(true);
  });

  it('unsubscribes from audit.created on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useAuditSocketListener(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('audit.created');
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useAuditSocketListener(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });

  it('does not subscribe to unrelated events', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useAuditSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).not.toContain('deposit.credited');
    expect(events).not.toContain('withdrawal.created');
  });
});
