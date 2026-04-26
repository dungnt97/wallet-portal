// Tests for use-recovery.ts — RECOVERY_QUERY_KEY, useStuckTxs, useBumpTx, useCancelTx.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_QUERY_KEY, useBumpTx, useCancelTx, useStuckTxs } from '../use-recovery';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/recovery', () => ({
  fetchStuckTxs: vi.fn(),
  bumpTx: vi.fn(),
  cancelTx: vi.fn(),
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

// ── RECOVERY_QUERY_KEY ────────────────────────────────────────────────────────

describe('RECOVERY_QUERY_KEY', () => {
  it('is "recovery.stuck"', () => {
    expect(RECOVERY_QUERY_KEY).toBe('recovery.stuck');
  });
});

// ── useStuckTxs ───────────────────────────────────────────────────────────────

describe('useStuckTxs', () => {
  it('fetches and returns stuck transactions', async () => {
    const { fetchStuckTxs } = await import('@/api/recovery');
    const data = [{ id: 'tx-1', entityType: 'withdrawal', entityId: 'wd-1', status: 'stuck' }];
    vi.mocked(fetchStuckTxs).mockResolvedValue(data as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStuckTxs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('calls fetchStuckTxs during query execution', async () => {
    const { fetchStuckTxs } = await import('@/api/recovery');
    vi.mocked(fetchStuckTxs).mockResolvedValue([] as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStuckTxs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchStuckTxs).toHaveBeenCalled();
  });
});

// ── useBumpTx ─────────────────────────────────────────────────────────────────

describe('useBumpTx', () => {
  it('calls bumpTx with entityType, entityId, and idempotencyKey', async () => {
    const { bumpTx, fetchStuckTxs } = await import('@/api/recovery');
    vi.mocked(bumpTx).mockResolvedValue({ ok: true } as never);
    vi.mocked(fetchStuckTxs).mockResolvedValue([] as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBumpTx(), { wrapper });
    const item = { entityType: 'withdrawal', entityId: 'wd-1' };
    await waitFor(async () => {
      await result.current.mutateAsync({
        item: item as never,
        idempotencyKey: 'key-abc',
      });
    });
    expect(bumpTx).toHaveBeenCalledWith('withdrawal', 'wd-1', { idempotencyKey: 'key-abc' });
  });

  it('starts in idle state', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBumpTx(), { wrapper });
    expect(result.current.status).toBe('idle');
  });
});

// ── useCancelTx ───────────────────────────────────────────────────────────────

describe('useCancelTx', () => {
  it('calls cancelTx with entityType, entityId, and idempotencyKey', async () => {
    const { cancelTx, fetchStuckTxs } = await import('@/api/recovery');
    vi.mocked(cancelTx).mockResolvedValue({ ok: true } as never);
    vi.mocked(fetchStuckTxs).mockResolvedValue([] as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCancelTx(), { wrapper });
    const item = { entityType: 'sweep', entityId: 'sw-2' };
    await waitFor(async () => {
      await result.current.mutateAsync({
        item: item as never,
        idempotencyKey: 'key-xyz',
      });
    });
    expect(cancelTx).toHaveBeenCalledWith('sweep', 'sw-2', { idempotencyKey: 'key-xyz' });
  });

  it('starts in idle state', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCancelTx(), { wrapper });
    expect(result.current.status).toBe('idle');
  });
});
