import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KYC_LABELS, userKeys, usersApi } from '../users';

// ── Mock api client ────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from '../client';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('KYC_LABELS', () => {
  it('has label for none tier', () => {
    expect(KYC_LABELS.none).toBe('None');
  });

  it('has label for basic tier', () => {
    expect(KYC_LABELS.basic).toBeTruthy();
  });

  it('has label for enhanced tier', () => {
    expect(KYC_LABELS.enhanced).toBeTruthy();
  });
});

describe('userKeys', () => {
  it('list key includes params', () => {
    const key = userKeys.list({ page: 1 });
    expect(key[0]).toBe('users');
    expect(key[1]).toBe('list');
    expect(key[2]).toEqual({ page: 1 });
  });

  it('list key without params', () => {
    const key = userKeys.list();
    expect(key[2]).toBeUndefined();
  });

  it('detail key includes id', () => {
    const key = userKeys.detail('user-1');
    expect(key).toEqual(['users', 'detail', 'user-1']);
  });

  it('balance key includes id', () => {
    const key = userKeys.balance('user-1');
    expect(key).toEqual(['users', 'balance', 'user-1']);
  });

  it('addresses key includes id', () => {
    const key = userKeys.addresses('user-1');
    expect(key).toEqual(['users', 'addresses', 'user-1']);
  });
});

describe('usersApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list calls GET /users without params', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list();
    expect(mockGet).toHaveBeenCalledWith('/users');
  });

  it('list builds query string with page and limit', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ page: 2, limit: 20 });
    expect(mockGet).toHaveBeenCalledWith('/users?page=2&limit=20');
  });

  it('list includes q filter', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ q: 'alice' });
    expect(mockGet).toHaveBeenCalledWith('/users?q=alice');
  });

  it('list includes kycTier filter', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ kycTier: 'basic' });
    expect(mockGet).toHaveBeenCalledWith('/users?kycTier=basic');
  });

  it('list includes status filter', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ status: 'active' });
    expect(mockGet).toHaveBeenCalledWith('/users?status=active');
  });

  it('list includes createdFrom and createdTo', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ createdFrom: '2024-01-01', createdTo: '2024-12-31' });
    expect(mockGet).toHaveBeenCalledWith('/users?createdFrom=2024-01-01&createdTo=2024-12-31');
  });

  it('list combines multiple params', () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1 } as never);
    usersApi.list({ page: 1, limit: 10, status: 'active' });
    const call = mockGet.mock.calls[0][0] as string;
    expect(call).toContain('page=1');
    expect(call).toContain('limit=10');
    expect(call).toContain('status=active');
  });

  it('get calls GET /users/:id', () => {
    mockGet.mockResolvedValue({} as never);
    usersApi.get('user-1');
    expect(mockGet).toHaveBeenCalledWith('/users/user-1');
  });

  it('create calls POST /users', () => {
    mockPost.mockResolvedValue({} as never);
    usersApi.create({ email: 'test@test.com' });
    expect(mockPost).toHaveBeenCalledWith('/users', { email: 'test@test.com' });
  });

  it('create passes kycTier', () => {
    mockPost.mockResolvedValue({} as never);
    usersApi.create({ email: 'x@x.com', kycTier: 'basic' });
    expect(mockPost).toHaveBeenCalledWith('/users', { email: 'x@x.com', kycTier: 'basic' });
  });

  it('updateKyc calls PATCH /users/:id/kyc', () => {
    mockPatch.mockResolvedValue({} as never);
    usersApi.updateKyc('user-1', 'enhanced');
    expect(mockPatch).toHaveBeenCalledWith('/users/user-1/kyc', { kycTier: 'enhanced' });
  });

  it('getBalance calls GET /users/:id/balance', () => {
    mockGet.mockResolvedValue({} as never);
    usersApi.getBalance('user-1');
    expect(mockGet).toHaveBeenCalledWith('/users/user-1/balance');
  });

  it('getAddresses calls GET /users/:id/addresses', () => {
    mockGet.mockResolvedValue({} as never);
    usersApi.getAddresses('user-1');
    expect(mockGet).toHaveBeenCalledWith('/users/user-1/addresses');
  });

  it('retryDerive calls POST /users/:id/derive-addresses', () => {
    mockPost.mockResolvedValue({} as never);
    usersApi.retryDerive('user-1');
    expect(mockPost).toHaveBeenCalledWith('/users/user-1/derive-addresses');
  });
});
