// TanStack Query v5 — query keys + stub hooks
// Real implementations wired in Phase 09.
import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// ---- Query key factory ----
export const queryKeys = {
  deposits: (params?: Record<string, unknown>) => ['deposits', params] as const,
  deposit: (id: string) => ['deposits', id] as const,
  withdrawals: (params?: Record<string, unknown>) => ['withdrawals', params] as const,
  users: (params?: Record<string, unknown>) => ['users', params] as const,
  transactions: (params?: Record<string, unknown>) => ['transactions', params] as const,
  auditLogs: (params?: Record<string, unknown>) => ['audit', params] as const,
  sweepJobs: () => ['sweep'] as const,
  multisigQueue: () => ['multisig'] as const,
  signers: () => ['signers'] as const,
  dashboardStats: () => ['dashboard', 'stats'] as const,
};

// ---- Stub hooks — return empty data until P09 wires real endpoints ----

export function useDeposits(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.deposits(params),
    queryFn: () => api.get<unknown[]>('/deposits'),
    staleTime: 30_000,
  });
}

export function useWithdrawals(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.withdrawals(params),
    queryFn: () => api.get<unknown[]>('/withdrawals'),
    staleTime: 30_000,
  });
}

export function useUsers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => api.get<unknown[]>('/users'),
    staleTime: 60_000,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats(),
    queryFn: () => api.get<unknown>('/dashboard/stats'),
    staleTime: 15_000,
  });
}
