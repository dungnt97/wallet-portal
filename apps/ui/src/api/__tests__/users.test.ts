// Tests for users.ts — KYC_LABELS constant, userKeys factory, buildQuery (via usersApi), hooks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KYC_LABELS, userKeys, usersApi } from '../users';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

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

// ── KYC_LABELS ────────────────────────────────────────────────────────────────

describe('KYC_LABELS', () => {
  it('has label for none', () => {
    expect(KYC_LABELS.none).toBe('None');
  });

  it('has label for basic', () => {
    expect(KYC_LABELS.basic).toBe('T1 Basic');
  });

  it('has label for enhanced', () => {
    expect(KYC_LABELS.enhanced).toBe('T3 Enhanced');
  });

  it('covers all three KYC tiers', () => {
    expect(Object.keys(KYC_LABELS)).toHaveLength(3);
  });
});

// ── userKeys factory ──────────────────────────────────────────────────────────

describe('userKeys', () => {
  it('list() with no params', () => {
    expect(userKeys.list()).toEqual(['users', 'list', undefined]);
  });

  it('list() with params includes params', () => {
    expect(userKeys.list({ page: 2, q: 'bob' })).toEqual(['users', 'list', { page: 2, q: 'bob' }]);
  });

  it('detail(id) returns correct key', () => {
    expect(userKeys.detail('user-123')).toEqual(['users', 'detail', 'user-123']);
  });

  it('balance(id) returns correct key', () => {
    expect(userKeys.balance('user-123')).toEqual(['users', 'balance', 'user-123']);
  });

  it('addresses(id) returns correct key', () => {
    expect(userKeys.addresses('user-123')).toEqual(['users', 'addresses', 'user-123']);
  });
});

// ── usersApi raw fetchers ─────────────────────────────────────────────────────

describe('usersApi.list', () => {
  it('calls api.get with /users when no params', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await usersApi.list();
    expect(api.get).toHaveBeenCalledWith('/users');
  });

  it('calls api.get with query string for page', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 2 });
    await usersApi.list({ page: 2 });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('page=2');
  });

  it('calls api.get with query string for search q', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await usersApi.list({ q: 'alice' });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('q=alice');
  });

  it('calls api.get with kycTier filter', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await usersApi.list({ kycTier: 'basic' });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('kycTier=basic');
  });

  it('calls api.get with status filter', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await usersApi.list({ status: 'suspended' });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('status=suspended');
  });

  it('calls api.get with date range filters', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await usersApi.list({ createdFrom: '2024-01-01', createdTo: '2024-12-31' });
    const url = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(url).toContain('createdFrom=');
    expect(url).toContain('createdTo=');
  });
});

describe('usersApi.get', () => {
  it('calls api.get with /users/:id', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ user: { id: 'u1' }, addressCount: 2 });
    await usersApi.get('u1');
    expect(api.get).toHaveBeenCalledWith('/users/u1');
  });
});

describe('usersApi.create', () => {
  it('calls api.post with /users and body', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ user: { id: 'u2' }, addresses: [] });
    await usersApi.create({ email: 'test@example.com' });
    expect(api.post).toHaveBeenCalledWith('/users', { email: 'test@example.com' });
  });
});

describe('usersApi.updateKyc', () => {
  it('calls api.patch with /users/:id/kyc', async () => {
    const { api } = await import('../client');
    vi.mocked(api.patch).mockResolvedValue({ user: { id: 'u1', kycTier: 'enhanced' } });
    await usersApi.updateKyc('u1', 'enhanced');
    expect(api.patch).toHaveBeenCalledWith('/users/u1/kyc', { kycTier: 'enhanced' });
  });
});

describe('usersApi.getBalance', () => {
  it('calls api.get with /users/:id/balance', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ USDT: '1000', USDC: '0' });
    await usersApi.getBalance('u1');
    expect(api.get).toHaveBeenCalledWith('/users/u1/balance');
  });
});

describe('usersApi.getAddresses', () => {
  it('calls api.get with /users/:id/addresses', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ addresses: [] });
    await usersApi.getAddresses('u1');
    expect(api.get).toHaveBeenCalledWith('/users/u1/addresses');
  });
});

describe('usersApi.retryDerive', () => {
  it('calls api.post with /users/:id/derive-addresses', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ addresses: [], alreadyComplete: false });
    await usersApi.retryDerive('u1');
    expect(api.post).toHaveBeenCalledWith('/users/u1/derive-addresses');
  });
});

// ── React Query hooks ─────────────────────────────────────────────────────────

describe('useUserList', () => {
  it('fetches and returns user list', async () => {
    const { api } = await import('../client');
    const data = { data: [{ id: 'u1', email: 'a@b.com' }], total: 1, page: 1 };
    vi.mocked(api.get).mockResolvedValue(data);
    const { wrapper } = makeWrapper();
    const { useUserList } = await import('../users');
    const { result } = renderHook(() => useUserList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });
});

describe('useUserDetail', () => {
  it('fetches user detail when id is set', async () => {
    const { api } = await import('../client');
    const data = { user: { id: 'u1', email: 'a@b.com' }, addressCount: 3 };
    vi.mocked(api.get).mockResolvedValue(data);
    const { wrapper } = makeWrapper();
    const { useUserDetail } = await import('../users');
    const { result } = renderHook(() => useUserDetail('u1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('is disabled when id is empty', async () => {
    const { wrapper } = makeWrapper();
    const { useUserDetail } = await import('../users');
    const { result } = renderHook(() => useUserDetail(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useUserBalance', () => {
  it('fetches balance when id is set', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ USDT: '5000', USDC: '200' });
    const { wrapper } = makeWrapper();
    const { useUserBalance } = await import('../users');
    const { result } = renderHook(() => useUserBalance('u1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ USDT: '5000', USDC: '200' });
  });
});

describe('useUserAddresses', () => {
  it('fetches addresses when id is set', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ addresses: [{ id: 'addr-1', chain: 'bnb' }] });
    const { wrapper } = makeWrapper();
    const { useUserAddresses } = await import('../users');
    const { result } = renderHook(() => useUserAddresses('u1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useCreateUser', () => {
  it('posts to /users on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ user: { id: 'new-1' }, addresses: [] });
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { useCreateUser } = await import('../users');
    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync({ email: 'new@user.com' });
    });
    expect(api.post).toHaveBeenCalledWith('/users', { email: 'new@user.com' });
  });
});

describe('useUpdateKyc', () => {
  it('patches /users/:id/kyc on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.patch).mockResolvedValue({ user: { id: 'u1' } });
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { useUpdateKyc } = await import('../users');
    const { result } = renderHook(() => useUpdateKyc('u1'), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync('enhanced');
    });
    expect(api.patch).toHaveBeenCalledWith('/users/u1/kyc', { kycTier: 'enhanced' });
  });
});

describe('useRetryDerive', () => {
  it('posts to /users/:id/derive-addresses', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ addresses: [], alreadyComplete: false });
    vi.mocked(api.get).mockResolvedValue({ addresses: [] });
    const { wrapper } = makeWrapper();
    const { useRetryDerive } = await import('../users');
    const { result } = renderHook(() => useRetryDerive('u1'), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync();
    });
    expect(api.post).toHaveBeenCalledWith('/users/u1/derive-addresses');
  });
});
