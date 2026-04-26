// Tests for sweep-socket-listener.ts — useSweepSocketListener hook.
// Verifies that socket events correctly trigger TanStack Query cache invalidations.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSweepSocketListener } from '../sweep-socket-listener';

// ── Mocks ─────────────────────────────────────────────────────────────────────

type EventHandler = () => void;

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  _handlers: {} as Record<string, EventHandler>,
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

// ── useSweepSocketListener ────────────────────────────────────────────────────

describe('useSweepSocketListener', () => {
  it('subscribes to sweep.started on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSweepSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('sweep.started');
  });

  it('subscribes to sweep.broadcast on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSweepSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('sweep.broadcast');
  });

  it('subscribes to sweep.confirmed on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSweepSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('sweep.confirmed');
  });

  it('subscribes to sweep.completed on mount', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSweepSocketListener(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('sweep.completed');
  });

  it('invalidates sweeps cache when sweep.started fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSweepSocketListener(), { wrapper });
    // Find and invoke the sweep.started handler
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'sweep.started');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('invalidates dashboard cache when sweep.confirmed fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useSweepSocketListener(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'sweep.confirmed');
    call?.[1]();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('dashboard'))).toBe(true);
  });

  it('unsubscribes from all events on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSweepSocketListener(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('sweep.started');
    expect(offEvents).toContain('sweep.broadcast');
    expect(offEvents).toContain('sweep.confirmed');
    expect(offEvents).toContain('sweep.completed');
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useSweepSocketListener(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
