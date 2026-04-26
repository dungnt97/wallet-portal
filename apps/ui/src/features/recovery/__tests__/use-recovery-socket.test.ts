// Tests for use-recovery-socket.ts — subscribes to 4 recovery events, invalidates cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));

// mockToastFn is what useToast() returns — captured for assertions
const mockToastFn = vi.fn();
vi.mock('@/components/overlays', () => ({
  useToast: vi.fn(() => mockToastFn),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Import after mocks
import { useRecoverySocket } from '../use-recovery-socket';

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

// ── useRecoverySocket ─────────────────────────────────────────────────────────

describe('useRecoverySocket', () => {
  const RECOVERY_EVENTS = [
    'recovery.bump.submitted',
    'recovery.cancel.submitted',
    'recovery.action.confirmed',
    'recovery.action.failed',
  ];

  it.each(RECOVERY_EVENTS)('subscribes to %s on mount', (event) => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRecoverySocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain(event);
  });

  it('subscribes to all 4 recovery events', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRecoverySocket(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    for (const event of RECOVERY_EVENTS) {
      expect(events).toContain(event);
    }
  });

  it('invalidates recovery cache when bump.submitted fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.bump.submitted');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('recovery'))).toBe(true);
  });

  it('invalidates recovery cache when action.confirmed fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.action.confirmed');
    call?.[1]({ entityType: 'withdrawal', entityId: 'wd-001' });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it.each(RECOVERY_EVENTS)('unsubscribes from %s on unmount', (event) => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useRecoverySocket(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain(event);
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useRecoverySocket(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });

  it('invalidates recovery cache when cancel.submitted fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.cancel.submitted');
    call?.[1]();
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('recovery'))).toBe(true);
  });

  it('invalidates recovery cache and calls toast when action.failed fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.action.failed');
    call?.[1]({ entityType: 'transaction', entityId: 'tx-abc-001' });
    expect(invalidateSpy).toHaveBeenCalled();
    expect(mockToastFn).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('calls toast with success when action.confirmed fires', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.action.confirmed');
    call?.[1]({ entityType: 'withdrawal', entityId: 'wd-001' });
    expect(mockToastFn).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('handles missing entityType and entityId in confirmed event gracefully', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.action.confirmed');
    // Should not throw when fields are missing
    expect(() => call?.[1]({})).not.toThrow();
  });

  it('handles missing entityType and entityId in failed event gracefully', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRecoverySocket(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'recovery.action.failed');
    expect(() => call?.[1]({})).not.toThrow();
  });
});
