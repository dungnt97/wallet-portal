// Tests for signer-ceremony-queries.ts — ceremonyKeys factory + React Query hooks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ceremonyKeys } from '../signer-ceremony-queries';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../signers', () => ({
  fetchCeremonies: vi.fn(),
  fetchCeremony: vi.fn(),
  addSigner: vi.fn(),
  removeSigner: vi.fn(),
  rotateSigners: vi.fn(),
  cancelCeremony: vi.fn(),
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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── ceremonyKeys factory ──────────────────────────────────────────────────────

describe('ceremonyKeys', () => {
  it('all() returns ["ceremonies"]', () => {
    expect(ceremonyKeys.all()).toEqual(['ceremonies']);
  });

  it('list() with no params returns ["ceremonies", "list", undefined]', () => {
    expect(ceremonyKeys.list()).toEqual(['ceremonies', 'list', undefined]);
  });

  it('list() with status filter includes params', () => {
    expect(ceremonyKeys.list({ status: 'pending' })).toEqual([
      'ceremonies',
      'list',
      { status: 'pending' },
    ]);
  });

  it('detail(id) returns ["ceremony", id]', () => {
    expect(ceremonyKeys.detail('c-001')).toEqual(['ceremony', 'c-001']);
  });

  it('staff() with no params returns ["staff", undefined]', () => {
    expect(ceremonyKeys.staff()).toEqual(['staff', undefined]);
  });

  it('staff() with role filter includes params', () => {
    expect(ceremonyKeys.staff({ role: 'treasurer' })).toEqual(['staff', { role: 'treasurer' }]);
  });
});

// ── useCeremonies ─────────────────────────────────────────────────────────────

describe('useCeremonies', () => {
  it('returns ceremony list data on success', async () => {
    const { fetchCeremonies } = await import('../signers');
    const page = {
      data: [{ id: 'c1', operationType: 'signer_add', status: 'confirmed' }],
      total: 1,
      page: 1,
    };
    vi.mocked(fetchCeremonies).mockResolvedValue(page as never);
    const { wrapper } = makeWrapper();
    const { useCeremonies } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useCeremonies(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(page);
  });

  it('passes params to fetchCeremonies', async () => {
    const { fetchCeremonies } = await import('../signers');
    vi.mocked(fetchCeremonies).mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    const { wrapper } = makeWrapper();
    const { useCeremonies } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useCeremonies({ status: 'pending', page: 2 }), {
      wrapper,
    });
    await waitFor(() => !result.current.isLoading);
    expect(fetchCeremonies).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', page: 2 })
    );
  });
});

// ── useCeremony ───────────────────────────────────────────────────────────────

describe('useCeremony', () => {
  it('fetches ceremony when id is defined', async () => {
    const { fetchCeremony } = await import('../signers');
    const row = { id: 'c1', operationType: 'signer_add', status: 'confirmed' };
    vi.mocked(fetchCeremony).mockResolvedValue(row as never);
    const { wrapper } = makeWrapper();
    const { useCeremony } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useCeremony('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(row);
  });

  it('is disabled when id is undefined', async () => {
    const { wrapper } = makeWrapper();
    const { useCeremony } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useCeremony(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ── useStaff ──────────────────────────────────────────────────────────────────

describe('useStaff', () => {
  it('fetches staff list', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 's1', name: 'Alice' }],
      total: 1,
    });
    const { wrapper } = makeWrapper();
    const { useStaff } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('/staff');
  });

  it('appends role query param when provided', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useStaff } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useStaff({ role: 'treasurer' }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('role=treasurer');
  });
});

// ── useAddSigner ──────────────────────────────────────────────────────────────

describe('useAddSigner', () => {
  it('calls addSigner on mutate', async () => {
    const { addSigner } = await import('../signers');
    const res = { ceremonyId: 'c1', bnbOpId: 'op-bnb', solanaOpId: 'op-sol' };
    vi.mocked(addSigner).mockResolvedValue(res);
    const { wrapper } = makeWrapper();
    const { useAddSigner } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useAddSigner(), { wrapper });
    const body = { targetStaffId: 'staff-1', reason: 'expand' };
    await waitFor(async () => {
      await result.current.mutateAsync(body);
    });
    expect(addSigner).toHaveBeenCalledWith(body);
  });
});

// ── useRemoveSigner ───────────────────────────────────────────────────────────

describe('useRemoveSigner', () => {
  it('calls removeSigner on mutate', async () => {
    const { removeSigner } = await import('../signers');
    vi.mocked(removeSigner).mockResolvedValue({
      ceremonyId: 'c2',
      bnbOpId: 'op-bnb',
      solanaOpId: 'op-sol',
    });
    const { wrapper } = makeWrapper();
    const { useRemoveSigner } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useRemoveSigner(), { wrapper });
    const body = { targetStaffId: 'staff-2', reason: 'offboarding' };
    await waitFor(async () => {
      await result.current.mutateAsync(body);
    });
    expect(removeSigner).toHaveBeenCalledWith(body);
  });
});

// ── useRotateSigners ──────────────────────────────────────────────────────────

describe('useRotateSigners', () => {
  it('calls rotateSigners on mutate', async () => {
    const { rotateSigners } = await import('../signers');
    vi.mocked(rotateSigners).mockResolvedValue({
      ceremonyId: 'c3',
      bnbOpId: 'op-bnb',
      solanaOpId: 'op-sol',
    });
    const { wrapper } = makeWrapper();
    const { useRotateSigners } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useRotateSigners(), { wrapper });
    const body = {
      addStaffIds: ['staff-3'],
      removeStaffIds: ['staff-1'],
      reason: 'rotation',
    };
    await waitFor(async () => {
      await result.current.mutateAsync(body);
    });
    expect(rotateSigners).toHaveBeenCalledWith(body);
  });
});

// ── useCancelCeremony ─────────────────────────────────────────────────────────

describe('useCancelCeremony', () => {
  it('calls cancelCeremony on mutate', async () => {
    const { cancelCeremony } = await import('../signers');
    vi.mocked(cancelCeremony).mockResolvedValue(undefined as never);
    const { wrapper } = makeWrapper();
    const { useCancelCeremony } = await import('../signer-ceremony-queries');
    const { result } = renderHook(() => useCancelCeremony(), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync('c1');
    });
    expect(cancelCeremony).toHaveBeenCalledWith('c1');
  });
});
