// Unit tests for withdrawals hooks: useWithdrawals, useWithdrawalsSocketListener, and adapter functions
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock API and socket
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

import { api } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/api/socket';
import {
  type ApiWithdrawal,
  apiToWithdrawalRow,
  useWithdrawals,
  useWithdrawalsSocketListener,
} from '../use-withdrawals';

// ── Fixtures & Types ─────────────────────────────────────────────────────────

interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

const mockApiWithdrawal: ApiWithdrawal = {
  id: 'wd-001',
  userId: 'user-123',
  chain: 'bnb',
  token: 'USDT',
  amount: '1000.50',
  destinationAddr: '0xDEADBEEF',
  status: 'approved',
  multisigOpId: 'op-001',
  txHash: null,
  createdAt: new Date('2026-04-21T10:00:00Z').toISOString(),
  updatedAt: new Date('2026-04-21T10:05:00Z').toISOString(),
  sourceTier: 'hot',
  timeLockExpiresAt: new Date('2026-04-23T10:00:00Z').toISOString(),
  collectedSigs: 1,
  requiredSigs: 2,
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

// ── Tests: API Adapter ────────────────────────────────────────────────────────

describe('apiToWithdrawalRow', () => {
  it('adapts pending status to awaiting_signatures stage', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'pending' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('awaiting_signatures');
  });

  it('adapts approved status to awaiting_signatures stage', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'approved' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('awaiting_signatures');
  });

  it('adapts time_locked status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'time_locked' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('time_locked');
  });

  it('adapts executing status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'executing' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('executing');
  });

  it('adapts broadcast status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'broadcast' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('broadcast');
  });

  it('adapts completed status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'completed' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('completed');
  });

  it('adapts cancelled status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'cancelled' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('cancelled');
  });

  it('adapts failed status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'failed' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('failed');
  });

  it('adapts cancelling status correctly', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, status: 'cancelling' };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('cancelling');
  });

  it('defaults unknown status to draft stage', () => {
    const wd: ApiWithdrawal = {
      ...mockApiWithdrawal,
      status: 'unknown_status' as ApiWithdrawal['status'],
    };
    const row = apiToWithdrawalRow(wd);
    expect(row.stage).toBe('draft');
  });

  it('converts amount string to number', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, amount: '2500.75' };
    const row = apiToWithdrawalRow(wd);
    expect(row.amount).toBe(2500.75);
  });

  it('defaults invalid amount to 0', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, amount: 'invalid' };
    const row = apiToWithdrawalRow(wd);
    expect(row.amount).toBe(0);
  });

  it('uses default multisig values when not provided', () => {
    const wd: ApiWithdrawal = {
      ...mockApiWithdrawal,
      requiredSigs: undefined,
      collectedSigs: undefined,
    };
    const row = apiToWithdrawalRow(wd);
    expect(row.multisig.required).toBe(2);
    expect(row.multisig.collected).toBe(0);
  });

  it('maps all required fields correctly', () => {
    const row = apiToWithdrawalRow(mockApiWithdrawal);
    expect(row.id).toBe('wd-001');
    expect(row.chain).toBe('bnb');
    expect(row.token).toBe('USDT');
    expect(row.destination).toBe('0xDEADBEEF');
    expect(row.requestedBy).toBe('user-123');
    expect(row.sourceTier).toBe('hot');
    expect(row.timeLockExpiresAt).toBeDefined();
  });

  it('maps optional multisigOpId to undefined when null', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, multisigOpId: null };
    const row = apiToWithdrawalRow(wd);
    expect(row.multisigOpId).toBeUndefined();
  });

  it('preserves sourceTier when present', () => {
    const wd: ApiWithdrawal = { ...mockApiWithdrawal, sourceTier: 'cold' };
    const row = apiToWithdrawalRow(wd);
    expect(row.sourceTier).toBe('cold');
  });
});

// ── Tests: useWithdrawals Hook ────────────────────────────────────────────────

describe('useWithdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and adapts withdrawals list', async () => {
    const mockResponse = {
      data: [mockApiWithdrawal],
      total: 1,
      page: 1,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useWithdrawals());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/withdrawals?limit=100');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('wd-001');
    expect(result.current.data?.[0].stage).toBe('awaiting_signatures');
  });

  it('handles empty withdrawals list', async () => {
    const mockResponse = {
      data: [],
      total: 0,
      page: 1,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useWithdrawals());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API error gracefully', async () => {
    const error = new Error('Failed to fetch withdrawals');
    vi.mocked(api.get).mockRejectedValue(error);

    const { result } = renderWithProvider(() => useWithdrawals());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });

  it('adapts multiple withdrawals with different statuses', async () => {
    const mockResponse = {
      data: [
        { ...mockApiWithdrawal, id: 'wd-1', status: 'pending' as const },
        { ...mockApiWithdrawal, id: 'wd-2', status: 'time_locked' as const },
        { ...mockApiWithdrawal, id: 'wd-3', status: 'completed' as const },
      ],
      total: 3,
      page: 1,
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderWithProvider(() => useWithdrawals());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.[0].stage).toBe('awaiting_signatures');
    expect(result.current.data?.[1].stage).toBe('time_locked');
    expect(result.current.data?.[2].stage).toBe('completed');
  });
});

// ── Tests: useWithdrawalsSocketListener ────────────────────────────────────────

describe('useWithdrawalsSocketListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects socket on mount', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    const { unmount } = renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    expect(connectSocket).toHaveBeenCalled();
    unmount();
  });

  it('disconnects socket on unmount', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    const { unmount } = renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    unmount();

    expect(disconnectSocket).toHaveBeenCalled();
  });

  it('registers handlers for all withdrawal events', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    // Should register handlers for main events
    const registeredEvents = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('withdrawal.created');
    expect(registeredEvents).toContain('withdrawal.approved');
    expect(registeredEvents).toContain('withdrawal.executing');
    expect(registeredEvents).toContain('withdrawal.broadcast');
    expect(registeredEvents).toContain('withdrawal.confirmed');
    expect(registeredEvents).toContain('withdrawal.cancelled');
    expect(registeredEvents).toContain('multisig.progress');
  });

  it('registers legacy event handlers for backward compatibility', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    const registeredEvents = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('withdrawals.submitted');
    expect(registeredEvents).toContain('withdrawals.approved');
    expect(registeredEvents).toContain('withdrawals.executed');
    expect(registeredEvents).toContain('multisig.approval');
  });

  it('unregisters all handlers on unmount', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    const { unmount } = renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    unmount();

    // Check that off() was called for all registered events
    const unregisteredEvents = mockSocket.off.mock.calls.map((c) => c[0]);
    expect(unregisteredEvents).toContain('withdrawal.created');
    expect(unregisteredEvents).toContain('withdrawal.approved');
    expect(unregisteredEvents.length).toBeGreaterThan(5);
  });

  it('invalidates withdrawals query on socket event', () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(connectSocket).mockReturnValue(
      mockSocket as unknown as ReturnType<typeof connectSocket>
    );

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderWithProvider(() => useWithdrawalsSocketListener(), queryClient);

    // Get the first registered handler (they should all be the same invalidateAll function)
    const handler = mockSocket.on.mock.calls[0][1];
    handler(); // Trigger the invalidate callback

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
