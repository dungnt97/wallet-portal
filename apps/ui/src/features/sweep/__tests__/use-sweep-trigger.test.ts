// Tests for use-sweep-trigger.ts — useSweepTrigger mutation hook.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSweepTrigger } from '../use-sweep-trigger';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
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

// ── useSweepTrigger ───────────────────────────────────────────────────────────

describe('useSweepTrigger', () => {
  it('posts to /sweeps/trigger with candidate_ids', async () => {
    const { api } = await import('@/api/client');
    const result = {
      created: [{ sweepId: 's1', userAddressId: 'a1', jobId: 'j1' }],
      skipped: [],
    };
    vi.mocked(api.post).mockResolvedValue(result);
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { result: hook } = renderHook(() => useSweepTrigger(), { wrapper });
    const body = { candidate_ids: ['a1', 'a2'] };
    let data: unknown;
    await waitFor(async () => {
      data = await hook.current.mutateAsync(body);
    });
    expect(api.post).toHaveBeenCalledWith('/sweeps/trigger', body);
    expect(data).toEqual(result);
  });

  it('returns created and skipped arrays on success', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.post).mockResolvedValue({
      created: [{ sweepId: 's2', userAddressId: 'a2', jobId: 'j2' }],
      skipped: [{ userAddressId: 'a3', reason: 'already swept' }],
    });
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { result: hook } = renderHook(() => useSweepTrigger(), { wrapper });
    let data: { created: unknown[]; skipped: unknown[] } | undefined;
    await waitFor(async () => {
      data = await hook.current.mutateAsync({ candidate_ids: ['a2'] });
    });
    expect(data?.created).toHaveLength(1);
    expect(data?.skipped).toHaveLength(1);
  });

  it('starts in idle state before mutation fires', () => {
    const { wrapper } = makeWrapper();
    const { result: hook } = renderHook(() => useSweepTrigger(), { wrapper });
    expect(hook.current.status).toBe('idle');
  });
});
