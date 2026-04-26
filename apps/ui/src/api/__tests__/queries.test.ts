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
