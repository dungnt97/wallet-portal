// Tests for withdrawals/socket-listener.ts — useWithdrawalSocketEvents hook.
// Covers all 7 socket events, cache invalidation, and toast notifications.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWithdrawalSocketEvents } from '../socket-listener';

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
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
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

// ── useWithdrawalSocketEvents ─────────────────────────────────────────────────

describe('useWithdrawalSocketEvents', () => {
  const ALL_EVENTS = [
    'withdrawal.created',
    'withdrawal.approved',
    'withdrawal.broadcast',
    'withdrawal.confirmed',
    'withdrawal.executing',
    'withdrawal.cancelled',
    'multisig.progress',
  ];

  it.each(ALL_EVENTS)('subscribes to %s on mount', (event) => {
    const { wrapper } = makeWrapper();
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(events).toContain(event);
  });

  it('subscribes to all 7 events', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const events = mockSocket.on.mock.calls.map((c) => c[0]);
    for (const event of ALL_EVENTS) {
      expect(events).toContain(event);
    }
  });

  it('invalidates withdrawals cache when withdrawal.created fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.created');
    call?.[1]({
      id: 'w-1',
      userId: 'u-1',
      chain: 'bnb',
      token: 'USDT',
      amount: '100',
      status: 'pending',
    });
    expect(invalidateSpy).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('withdrawals'))).toBe(true);
  });

  it('invalidates multisig cache when withdrawal.approved fires', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.approved');
    call?.[1]({
      withdrawalId: 'w-1',
      multisigOpId: 'op-1',
      progress: '1/2',
      thresholdMet: false,
      collectedSigs: 1,
      requiredSigs: 2,
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('multisig'))).toBe(true);
  });

  it('invalidates dashboard cache on any event', () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.executing');
    call?.[1]();
    const keys = invalidateSpy.mock.calls.map((c) => c[0]);
    expect(keys.some((k) => JSON.stringify(k).includes('dashboard'))).toBe(true);
  });

  it('calls toast with success when withdrawal.broadcast fires', async () => {
    const mockToast = vi.fn();
    const { useToast } = await import('@/components/overlays');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.broadcast');
    call?.[1]({ withdrawalId: 'w-1', txHash: '0xabcdef1234567890abcdef', status: 'broadcast' });
    expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('calls toast with success when withdrawal.confirmed fires', async () => {
    const mockToast = vi.fn();
    const { useToast } = await import('@/components/overlays');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.confirmed');
    call?.[1]({ withdrawalId: 'w-1', status: 'completed' });
    expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('does not call toast for withdrawal.created (no user-facing notification)', async () => {
    const mockToast = vi.fn();
    const { useToast } = await import('@/components/overlays');
    vi.mocked(useToast).mockReturnValue(mockToast);
    const { wrapper } = makeWrapper();
    renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    const call = mockSocket.on.mock.calls.find((c) => c[0] === 'withdrawal.created');
    call?.[1]({
      id: 'w-1',
      userId: 'u-1',
      chain: 'bnb',
      token: 'USDT',
      amount: '100',
      status: 'pending',
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each(ALL_EVENTS)('unsubscribes from %s on unmount', (event) => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    unmount();
    const offEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain(event);
  });

  it('calls disconnectSocket on unmount', async () => {
    const { disconnectSocket } = await import('@/api/socket');
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useWithdrawalSocketEvents(), { wrapper });
    unmount();
    expect(disconnectSocket).toHaveBeenCalled();
  });
});
