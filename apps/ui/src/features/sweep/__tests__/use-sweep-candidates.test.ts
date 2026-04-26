// Tests for use-sweep-candidates.ts — SWEEP_CANDIDATES_QUERY_KEY and useSweepCandidates hook.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWEEP_CANDIDATES_QUERY_KEY, useSweepCandidates } from '../use-sweep-candidates';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: { get: vi.fn() },
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

// ── SWEEP_CANDIDATES_QUERY_KEY ────────────────────────────────────────────────

describe('SWEEP_CANDIDATES_QUERY_KEY', () => {
  it('returns base key with no args', () => {
    expect(SWEEP_CANDIDATES_QUERY_KEY()).toEqual(['sweeps', 'candidates', undefined, undefined]);
  });

  it('returns key with chain', () => {
    expect(SWEEP_CANDIDATES_QUERY_KEY('bnb')).toEqual(['sweeps', 'candidates', 'bnb', undefined]);
  });

  it('returns key with chain and token', () => {
    expect(SWEEP_CANDIDATES_QUERY_KEY('sol', 'USDC')).toEqual([
      'sweeps',
      'candidates',
      'sol',
      'USDC',
    ]);
  });
});

// ── useSweepCandidates ────────────────────────────────────────────────────────

describe('useSweepCandidates', () => {
  it('fetches /sweeps/candidates with no filters', async () => {
    const { api } = await import('@/api/client');
    const data = { data: [{ userAddressId: 'a1', chain: 'bnb', estimatedUsd: 500 }], total: 1 };
    vi.mocked(api.get).mockResolvedValue(data);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSweepCandidates(), { wrapper });
    // placeholderData causes isSuccess=true immediately with empty data; wait for real fetch
    await waitFor(() => expect(result.current.data?.total).toBe(1));
    expect(result.current.data).toEqual(data);
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/sweeps/candidates');
  });

  it('appends chain filter to query string', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSweepCandidates('bnb'), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('chain=bnb');
  });

  it('appends token filter to query string', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSweepCandidates('sol', 'USDT'), { wrapper });
    await waitFor(() => !result.current.isLoading);
    const url = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(url).toContain('chain=sol');
    expect(url).toContain('token=USDT');
  });

  it('returns placeholder data on error', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockRejectedValue(new Error('network error'));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSweepCandidates(), { wrapper });
    // placeholderData should be available immediately
    expect(result.current.data).toEqual({ data: [], total: 0 });
  });
});
