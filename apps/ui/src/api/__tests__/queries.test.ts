import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../queries';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      // biome-ignore lint/suspicious/noExplicitAny: test wrapper JSX
      (QueryClientProvider as any)({ client: qc, children }),
  };
}

// ── queryKeys factory ─────────────────────────────────────────────────────────

describe('queryKeys factory', () => {
  it('deposits() with no params returns ["deposits", undefined]', () => {
    expect(queryKeys.deposits()).toEqual(['deposits', undefined]);
  });

  it('deposits() with params includes params in key', () => {
    const key = queryKeys.deposits({ page: 1 });
    expect(key[0]).toBe('deposits');
    expect(key[1]).toEqual({ page: 1 });
  });

  it('deposit(id) returns ["deposits", id]', () => {
    expect(queryKeys.deposit('dep-001')).toEqual(['deposits', 'dep-001']);
  });

  it('withdrawals() with no params returns ["withdrawals", undefined]', () => {
    expect(queryKeys.withdrawals()).toEqual(['withdrawals', undefined]);
  });

  it('withdrawal(id) returns ["withdrawals", id]', () => {
    expect(queryKeys.withdrawal('wd-001')).toEqual(['withdrawals', 'wd-001']);
  });

  it('users() returns ["users", undefined]', () => {
    expect(queryKeys.users()).toEqual(['users', undefined]);
  });

  it('users() with params includes params', () => {
    expect(queryKeys.users({ search: 'alice' })).toEqual(['users', { search: 'alice' }]);
  });

  it('transactions() returns ["transactions", undefined]', () => {
    expect(queryKeys.transactions()).toEqual(['transactions', undefined]);
  });

  it('auditLogs() returns ["audit", undefined]', () => {
    expect(queryKeys.auditLogs()).toEqual(['audit', undefined]);
  });

  it('sweepJobs() returns ["sweep"]', () => {
    expect(queryKeys.sweepJobs()).toEqual(['sweep']);
  });

  it('sweepBatches() returns ["sweep", "batches"]', () => {
    expect(queryKeys.sweepBatches()).toEqual(['sweep', 'batches']);
  });

  it('multisigQueue() returns ["multisig", undefined]', () => {
    expect(queryKeys.multisigQueue()).toEqual(['multisig', undefined]);
  });

  it('signers() returns ["signers"]', () => {
    expect(queryKeys.signers()).toEqual(['signers']);
  });

  it('dashboardStats() returns ["dashboard", "stats"]', () => {
    expect(queryKeys.dashboardStats()).toEqual(['dashboard', 'stats']);
  });

  it('dashboardMetrics() returns ["dashboard", "metrics"]', () => {
    expect(queryKeys.dashboardMetrics()).toEqual(['dashboard', 'metrics']);
  });

  it('dashboardHistory(metric, range) returns correct key', () => {
    expect(queryKeys.dashboardHistory('aum', '7d')).toEqual(['dashboard', 'history', 'aum', '7d']);
  });

  it('killSwitch() returns ["ops", "killSwitch"]', () => {
    expect(queryKeys.killSwitch()).toEqual(['ops', 'killSwitch']);
  });

  it('opsHealth() returns ["ops", "health"]', () => {
    expect(queryKeys.opsHealth()).toEqual(['ops', 'health']);
  });

  it('coldBalances() returns ["cold", "balances"]', () => {
    expect(queryKeys.coldBalances()).toEqual(['cold', 'balances']);
  });

  it('coldWallets() returns ["cold", "wallets"]', () => {
    expect(queryKeys.coldWallets()).toEqual(['cold', 'wallets']);
  });

  it('rebalanceHistory() returns ["rebalance", "history"]', () => {
    expect(queryKeys.rebalanceHistory()).toEqual(['rebalance', 'history']);
  });

  it('staff() returns ["staff"]', () => {
    expect(queryKeys.staff()).toEqual(['staff']);
  });

  it('loginHistory() returns ["staff", "loginHistory"]', () => {
    expect(queryKeys.loginHistory()).toEqual(['staff', 'loginHistory']);
  });

  it('notifChannels() returns ["notif", "channels"]', () => {
    expect(queryKeys.notifChannels()).toEqual(['notif', 'channels']);
  });

  it('each key factory returns a const tuple (readonly array)', () => {
    const key = queryKeys.signers();
    expect(Array.isArray(key)).toBe(true);
  });

  it('keys for different params are distinct', () => {
    const k1 = queryKeys.deposits({ page: 1 });
    const k2 = queryKeys.deposits({ page: 2 });
    expect(k1).not.toEqual(k2);
  });

  it('keys for same params are equal', () => {
    const k1 = queryKeys.deposits({ page: 1 });
    const k2 = queryKeys.deposits({ page: 1 });
    expect(k1).toEqual(k2);
  });
});

// ── Read hooks: basic mount + data fetch ──────────────────────────────────────

describe('useDeposits', () => {
  it('fetches deposits from /deposits and returns data', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([{ id: 'dep-1' }]);
    const { wrapper } = makeWrapper();
    const { useDeposits } = await import('../queries');
    const { result } = renderHook(() => useDeposits(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'dep-1' }]);
  });

  it('passes params in queryKey', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useDeposits } = await import('../queries');
    const { result } = renderHook(() => useDeposits({ page: 2 }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useWithdrawals', () => {
  it('fetches withdrawals from /withdrawals', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([{ id: 'wd-1' }]);
    const { wrapper } = makeWrapper();
    const { useWithdrawals } = await import('../queries');
    const { result } = renderHook(() => useWithdrawals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'wd-1' }]);
  });
});

describe('useUsers', () => {
  it('fetches users from /users', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([{ id: 'u-1' }]);
    const { wrapper } = makeWrapper();
    const { useUsers } = await import('../queries');
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'u-1' }]);
  });
});

describe('useDashboardStats', () => {
  it('fetches dashboard stats from /dashboard/stats', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ aumUsdt: '1000000' });
    const { wrapper } = makeWrapper();
    const { useDashboardStats } = await import('../queries');
    const { result } = renderHook(() => useDashboardStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ aumUsdt: '1000000' });
  });
});

describe('useDashboardMetrics', () => {
  it('fetches metrics from /dashboard/metrics', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ pendingDeposits: 5 });
    const { wrapper } = makeWrapper();
    const { useDashboardMetrics } = await import('../queries');
    const { result } = renderHook(() => useDashboardMetrics(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ pendingDeposits: 5 });
  });
});

describe('useOpsHealth', () => {
  it('fetches ops health from /ops/health', async () => {
    const { api } = await import('../client');
    const health = { db: { status: 'ok' }, chains: [] };
    vi.mocked(api.get).mockResolvedValue(health);
    const { wrapper } = makeWrapper();
    const { useOpsHealth } = await import('../queries');
    const { result } = renderHook(() => useOpsHealth(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(health);
  });
});

describe('useColdBalances', () => {
  it('returns data from /cold/balances', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [{ chain: 'bnb', balance: '100' }] });
    const { wrapper } = makeWrapper();
    const { useColdBalances } = await import('../queries');
    const { result } = renderHook(() => useColdBalances(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ chain: 'bnb', balance: '100' }]);
  });
});

// ── Mutation hooks ────────────────────────────────────────────────────────────

describe('useCreateWithdrawal', () => {
  it('posts to /withdrawals and returns result', async () => {
    const { api } = await import('../client');
    const expected = { withdrawal: { id: 'new-1' }, multisigOpId: 'op-1' };
    vi.mocked(api.post).mockResolvedValue(expected);
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useCreateWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useCreateWithdrawal(), { wrapper });
    const body = {
      userId: 'u1',
      chain: 'bnb' as const,
      token: 'USDT' as const,
      amount: '1000',
      destinationAddr: '0xDest',
      sourceTier: 'hot' as const,
    };
    let data: unknown;
    await waitFor(async () => {
      data = await result.current.mutateAsync(body);
    });
    expect(api.post).toHaveBeenCalledWith('/withdrawals', body);
    expect(data).toEqual(expected);
  });
});

describe('useCancelWithdrawal', () => {
  it('posts to /withdrawals/:id/cancel', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useCancelWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useCancelWithdrawal('wd-123'), { wrapper });
    await waitFor(async () => {
      await result.current.mutateAsync({ reason: 'wrong address' });
    });
    expect(api.post).toHaveBeenCalledWith('/withdrawals/wd-123/cancel', {
      reason: 'wrong address',
    });
  });
});

describe('useNavCounts', () => {
  it('fetches from /nav/counts', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ pendingWithdrawals: 3 });
    const { wrapper } = makeWrapper();
    const { useNavCounts } = await import('../queries');
    const { result } = renderHook(() => useNavCounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ pendingWithdrawals: 3 });
  });
});

describe('useStaffList', () => {
  it('fetches from /staff', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 's1', name: 'Alice' }], total: 1 });
    const { wrapper } = makeWrapper();
    const { useStaffList } = await import('../queries');
    const { result } = renderHook(() => useStaffList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useTransactions', () => {
  it('fetches from /transactions', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useTransactions } = await import('../queries');
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useMultisigOps', () => {
  it('fetches from /multisig/ops', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useMultisigOps } = await import('../queries');
    const { result } = renderHook(() => useMultisigOps(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useLoginHistory', () => {
  it('fetches from /staff/login-history', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useLoginHistory } = await import('../queries');
    const { result } = renderHook(() => useLoginHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useDashboardHistory', () => {
  it('fetches history for aum/7d', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ points: [{ t: '2024-01-01', v: 1000 }] });
    const { wrapper } = makeWrapper();
    const { useDashboardHistory } = await import('../queries');
    const { result } = renderHook(() => useDashboardHistory('aum', '7d'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useKillSwitch', () => {
  it('fetches kill switch status', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ enabled: false });
    const { wrapper } = makeWrapper();
    const { useKillSwitch } = await import('../queries');
    const { result } = renderHook(() => useKillSwitch(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ enabled: false });
  });
});

describe('useNotifChannels', () => {
  it('fetches notification channels', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useNotifChannels } = await import('../queries');
    const { result } = renderHook(() => useNotifChannels(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useSweepBatches', () => {
  it('fetches sweep batches', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useSweepBatches } = await import('../queries');
    const { result } = renderHook(() => useSweepBatches(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useSignersStats', () => {
  it('fetches signer stats', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ total: 3, active: 2, threshold: 2 });
    const { wrapper } = makeWrapper();
    const { useSignersStats } = await import('../queries');
    const { result } = renderHook(() => useSignersStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useSlaSummary', () => {
  it('fetches SLA summary', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ depositAvgSec: 38 });
    const { wrapper } = makeWrapper();
    const { useSlaSummary } = await import('../queries');
    const { result } = renderHook(() => useSlaSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useRebalanceHistory', () => {
  it('fetches rebalance history', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useRebalanceHistory } = await import('../queries');
    const { result } = renderHook(() => useRebalanceHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('adminNotifQueryKeys', () => {
  it('has correct key structure', async () => {
    const { adminNotifQueryKeys } = await import('../queries');
    expect(adminNotifQueryKeys.channels()).toBeDefined();
    expect(adminNotifQueryKeys.routing()).toBeDefined();
  });
});

describe('useMultisigSyncStatus', () => {
  it('fetches from /multisig/sync-status', async () => {
    const { api } = await import('../client');
    const mockStatus = {
      bnb: { status: 'synced', lastSyncAt: '2024-01-01T00:00:00.000Z', nonce: 42 },
      sol: { status: 'synced', lastSyncAt: '2024-01-01T00:00:00.000Z' },
    };
    vi.mocked(api.get).mockResolvedValue(mockStatus);
    const { wrapper } = makeWrapper();
    const { useMultisigSyncStatus } = await import('../queries');
    const { result } = renderHook(() => useMultisigSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(vi.mocked(api.get)).toHaveBeenCalledWith(expect.stringContaining('sync-status'));
  });

  it('falls back to error status when api.get rejects', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));
    const { wrapper } = makeWrapper();
    const { useMultisigSyncStatus } = await import('../queries');
    const { result } = renderHook(() => useMultisigSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.bnb.status).toBe('error');
    expect(result.current.data?.sol.status).toBe('error');
  });
});

describe('useRefreshMultisigSync', () => {
  it('posts to /multisig/sync-refresh', async () => {
    const { api } = await import('../client');
    const mockStatus = {
      bnb: { status: 'synced', lastSyncAt: '2024-01-01T00:00:00.000Z' },
      sol: { status: 'synced', lastSyncAt: '2024-01-01T00:00:00.000Z' },
    };
    vi.mocked(api.post).mockResolvedValue(mockStatus);
    const { wrapper } = makeWrapper();
    const { useRefreshMultisigSync } = await import('../queries');
    const { result } = renderHook(() => useRefreshMultisigSync(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalledWith(expect.stringContaining('sync-refresh'));
  });

  it('falls back to error status when api.post rejects', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockRejectedValue(new Error('Unreachable'));
    const { wrapper } = makeWrapper();
    const { useRefreshMultisigSync } = await import('../queries');
    const { result } = renderHook(() => useRefreshMultisigSync(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.bnb.status).toBe('error');
  });
});

// ── Additional query/mutation hooks ──────────────────────────────────────────

describe('useKillSwitch', () => {
  it('fetches from api.get', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ enabled: false, reason: null });
    const { wrapper } = makeWrapper();
    const { useKillSwitch } = await import('../queries');
    const { result } = renderHook(() => useKillSwitch(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useOpsHealth', () => {
  it('fetches health from api.get', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ status: 'ok' });
    const { wrapper } = makeWrapper();
    const { useOpsHealth } = await import('../queries');
    const { result } = renderHook(() => useOpsHealth(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useToggleKillSwitch', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ enabled: true, reason: 'test' });
    const { wrapper } = makeWrapper();
    const { useToggleKillSwitch } = await import('../queries');
    const { result } = renderHook(() => useToggleKillSwitch(), { wrapper });
    result.current.mutate({ enabled: true, reason: 'test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useMultisigOps', () => {
  it('fetches multisig ops list', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { useMultisigOps } = await import('../queries');
    const { result } = renderHook(() => useMultisigOps(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });

  it('passes pagination params in query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 2 });
    const { wrapper } = makeWrapper();
    const { useMultisigOps } = await import('../queries');
    const { result } = renderHook(() => useMultisigOps({ page: 2, limit: 10 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calls = vi.mocked(api.get).mock.calls;
    const url = calls[calls.length - 1][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });
});

describe('useStaffList', () => {
  it('fetches staff list', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { useStaffList } = await import('../queries');
    const { result } = renderHook(() => useStaffList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useSweepBatches', () => {
  it('fetches sweep batches without chain filter', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useSweepBatches } = await import('../queries');
    const { result } = renderHook(() => useSweepBatches(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });

  it('passes chain param when provided', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useSweepBatches } = await import('../queries');
    const { result } = renderHook(() => useSweepBatches('bnb'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calls = vi.mocked(api.get).mock.calls;
    const url = calls[calls.length - 1][0] as string;
    expect(url).toContain('chain=bnb');
  });
});

describe('useTransactions', () => {
  it('fetches transactions list', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { useTransactions } = await import('../queries');
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useLoginHistory', () => {
  it('fetches login history', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useLoginHistory } = await import('../queries');
    const { result } = renderHook(() => useLoginHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useNotifChannels', () => {
  it('fetches notification channels', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useNotifChannels } = await import('../queries');
    const { result } = renderHook(() => useNotifChannels(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useAdminChannels', () => {
  it('fetches admin notification channels', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useAdminChannels } = await import('../queries');
    const { result } = renderHook(() => useAdminChannels(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useAdminRouting', () => {
  it('fetches admin routing rules', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { useAdminRouting } = await import('../queries');
    const { result } = renderHook(() => useAdminRouting(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useNavCounts', () => {
  it('fetches nav badge counts', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({
      deposits: 2,
      sweep: 1,
      withdrawals: 3,
      multisig: 0,
      recovery: 0,
    });
    const { wrapper } = makeWrapper();
    const { useNavCounts } = await import('../queries');
    const { result } = renderHook(() => useNavCounts(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(vi.mocked(api.get)).toHaveBeenCalledWith(expect.stringContaining('nav-counts'));
  });
});

describe('useAddDepositToSweep', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useAddDepositToSweep } = await import('../queries');
    const { result } = renderHook(() => useAddDepositToSweep('dep-1'), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useRejectWithdrawal', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useRejectWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useRejectWithdrawal('wd-1'), { wrapper });
    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useSubmitWithdrawal', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useSubmitWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useSubmitWithdrawal('wd-2'), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useApproveMultisigOp', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useApproveMultisigOp } = await import('../queries');
    const { result } = renderHook(() => useApproveMultisigOp('op-1'), { wrapper });
    result.current.mutate({ signature: '0xsig', signerAddress: '0xaddr', chain: 'bnb' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useRejectMultisigOp', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useRejectMultisigOp } = await import('../queries');
    const { result } = renderHook(() => useRejectMultisigOp('op-1'), { wrapper });
    result.current.mutate({ reason: 'test' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useExecuteMultisigOp', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useExecuteMultisigOp } = await import('../queries');
    const { result } = renderHook(() => useExecuteMultisigOp('op-1'), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useSlaSummary', () => {
  it('fetches SLA summary', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ avgConfirmMs: 1200, p99ConfirmMs: 3000 });
    const { wrapper } = makeWrapper();
    const { useSlaSummary } = await import('../queries');
    const { result } = renderHook(() => useSlaSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useComplianceSummary', () => {
  it('fetches compliance summary', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ flaggedCount: 0 });
    const { wrapper } = makeWrapper();
    const { useComplianceSummary } = await import('../queries');
    const { result } = renderHook(() => useComplianceSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useColdWallets', () => {
  it('fetches cold wallets', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    const { wrapper } = makeWrapper();
    const { useColdWallets } = await import('../queries');
    const { result } = renderHook(() => useColdWallets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useColdBalances', () => {
  it('fetches cold balances', async () => {
    const { api } = await import('../client');
    // useColdBalances calls api.get(...).then(r => r.data) — mock the full response shape
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    const { wrapper } = makeWrapper();
    const { useColdBalances } = await import('../queries');
    const { result } = renderHook(() => useColdBalances(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useWallets', () => {
  it('fetches wallets list', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { useWallets } = await import('../queries');
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useCreateAdminChannel', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ id: 'ch-1' });
    const { wrapper } = makeWrapper();
    const { useCreateAdminChannel } = await import('../queries');
    const { result } = renderHook(() => useCreateAdminChannel(), { wrapper });
    result.current.mutate({ name: 'slack', config: {} } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useUpdateAdminChannel', () => {
  it('calls api.patch on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.patch).mockResolvedValue({ id: 'ch-1' });
    const { wrapper } = makeWrapper();
    const { useUpdateAdminChannel } = await import('../queries');
    const { result } = renderHook(() => useUpdateAdminChannel(), { wrapper });
    result.current.mutate({ id: 'ch-1', update: {} } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.patch)).toHaveBeenCalled();
  });
});

describe('useDeleteAdminChannel', () => {
  it('calls api.delete on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useDeleteAdminChannel } = await import('../queries');
    const { result } = renderHook(() => useDeleteAdminChannel(), { wrapper });
    result.current.mutate('ch-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.delete)).toHaveBeenCalled();
  });
});

describe('useTestAdminChannel', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ sent: true });
    const { wrapper } = makeWrapper();
    const { useTestAdminChannel } = await import('../queries');
    const { result } = renderHook(() => useTestAdminChannel(), { wrapper });
    result.current.mutate('ch-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useUpsertRoutingRule', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useUpsertRoutingRule } = await import('../queries');
    const { result } = renderHook(() => useUpsertRoutingRule(), { wrapper });
    result.current.mutate({ eventType: 'deposit.credited', channelId: 'ch-1' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useDashboardMetrics', () => {
  it('fetches dashboard metrics', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ series: [] });
    const { wrapper } = makeWrapper();
    const { useDashboardMetrics } = await import('../queries');
    const { result } = renderHook(() => useDashboardMetrics(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useDashboardHistory', () => {
  it('fetches dashboard history for metric and range', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ points: [] });
    const { wrapper } = makeWrapper();
    const { useDashboardHistory } = await import('../queries');
    const { result } = renderHook(() => useDashboardHistory('aum', '7d'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalled();
  });
});

describe('useRunBandCheck', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { useRunBandCheck } = await import('../queries');
    const { result } = renderHook(() => useRunBandCheck(), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useRebalance', () => {
  it('calls api.post on mutate', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ jobId: 'reb-1' });
    const { wrapper } = makeWrapper();
    const { useRebalance } = await import('../queries');
    const { result } = renderHook(() => useRebalance(), { wrapper });
    result.current.mutate({ direction: 'hot_to_cold', amount: '1000', chain: 'bnb' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
  });
});

describe('useApproveWithdrawal', () => {
  it('posts to /withdrawals/:id/approve', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({
      op: { collectedSigs: 1, requiredSigs: 2 },
      thresholdMet: false,
    });
    const { wrapper, qc } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { useApproveWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useApproveWithdrawal('wd-1'), { wrapper });
    result.current.mutate({
      signature: '0xsig',
      signerAddress: '0xaddr',
      signedAt: new Date().toISOString(),
      multisigOpId: 'op-1',
      chain: 'bnb',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useExecuteWithdrawal', () => {
  it('posts to /withdrawals/:id/execute', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    const { wrapper, qc } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { useExecuteWithdrawal } = await import('../queries');
    const { result } = renderHook(() => useExecuteWithdrawal('wd-2'), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.post)).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
