// Tests for use-signers-socket.ts — subscribes to 6 ceremony events, invalidates cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignersSocket } from '../use-signers-socket';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
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

// ── useSignersSocket ──────────────────────────────────────────────────────────

describe('useSignersSocket', () => {
  const CEREMONY_EVENTS = [
    'signer.ceremony.created',
    'signer.ceremony.started',
    'signer.ceremony.chain_confirmed',
    'signer.ceremony.completed',
    'signer.ceremony.failed',
    'signer.ceremony.cancelled',
  ];

  it.each(CEREMONY_EVENTS)('subscribes to %s on mount', (event) => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSignersSocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain(event);
  });

  it('subscribes to all 6 ceremony events', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSignersSocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    for (const event of CEREMONY_EVENTS) {
      expect(events).toContain(event);
    }
  });

  it('invalidates ceremonies cache when event fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSignersSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'signer.ceremony.completed');
    call?.[1]({});
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('ceremonies'))).toBe(true);
  });

  it('invalidates ceremony detail when ceremonyId is in payload', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSignersSocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'signer.ceremony.completed');
    call?.[1]({ ceremonyId: 'c-001' });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('c-001'))).toBe(true);
  });

  it.each(CEREMONY_EVENTS)('unsubscribes from %s on unmount', (event) => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSignersSocket(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain(event);
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSignersSocket(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
