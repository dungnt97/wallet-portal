// Unit tests for deposits hooks: useDeposits
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock API
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from '@/api/client';
import { type Deposit, type DepositsResponse, useDeposits } from '../use-deposits';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockDeposit: Deposit = {
  id: 'dep-001',
  userId: 'user-123',
  userEmail: 'user@example.com',
  userAddress: '0xUSER',
  chain: 'bnb',
  token: 'USDT',
  amount: '1000.50',
  status: 'pending',
  confirmedBlocks: 5,
  txHash: '0xTX123',
  createdAt: new Date('2026-04-21T10:00:00Z').toISOString(),
  updatedAt: new Date('2026-04-21T10:05:00Z').toISOString(),
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProvider<T>(hook: () => T, queryClient: QueryClient = createQueryClient()) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeposits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches deposits with default params', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should be called with default params
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/deposits'));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=1'));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
    expect(result.current.data).toEqual(mockResponse);
  });

  it('fetches with custom page and limit', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 100,
      page: 2,
      limit: 50,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ page: 2, limit: 50 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('limit=50'));
  });

  it('filters by status when provided', async () => {
    const mockResponse: DepositsResponse = {
      data: [{ ...mockDeposit, status: 'credited' }],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ status: 'credited' }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=credited'));
  });

  it('filters by chain when provided', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ chain: 'sol' }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('chain=sol'));
  });

  it('filters by token when provided', async () => {
    const mockResponse: DepositsResponse = {
      data: [{ ...mockDeposit, token: 'USDC' }],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ token: 'USDC' }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('token=USDC'));
  });

  it('filters by minAmount when provided', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ minAmount: 500 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('minAmount=500'));
  });

  it('filters by maxAmount when provided', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ maxAmount: 5000 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('maxAmount=5000'));
  });

  it('filters by dateFrom when provided', async () => {
    const dateFrom = '2026-04-01T00:00:00Z';
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ dateFrom }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('dateFrom='));
  });

  it('filters by dateTo when provided', async () => {
    const dateTo = '2026-04-30T23:59:59Z';
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits({ dateTo }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('dateTo='));
  });

  it('combines multiple filters', async () => {
    const mockResponse: DepositsResponse = {
      data: [mockDeposit],
      total: 1,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() =>
      useDeposits({
        status: 'pending',
        chain: 'bnb',
        token: 'USDT',
        minAmount: 100,
        maxAmount: 10000,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callUrl = vi.mocked(api.get).mock.calls[0][0];
    expect(callUrl).toContain('status=pending');
    expect(callUrl).toContain('chain=bnb');
    expect(callUrl).toContain('token=USDT');
    expect(callUrl).toContain('minAmount=100');
    expect(callUrl).toContain('maxAmount=10000');
  });

  it('handles API error gracefully', async () => {
    const error = new Error('Failed to fetch deposits');
    vi.mocked(api.get).mockRejectedValue(error);

    const { result } = renderWithProvider(() => useDeposits());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });

  it('handles empty deposits list', async () => {
    const mockResponse: DepositsResponse = {
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.data).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('handles multiple deposits with different statuses', async () => {
    const mockResponse: DepositsResponse = {
      data: [
        { ...mockDeposit, id: 'dep-1', status: 'pending' },
        { ...mockDeposit, id: 'dep-2', status: 'credited' },
        { ...mockDeposit, id: 'dep-3', status: 'swept' },
      ],
      total: 3,
      page: 1,
      limit: 20,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useDeposits());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.data).toHaveLength(3);
    expect(result.current.data?.total).toBe(3);
  });
});
