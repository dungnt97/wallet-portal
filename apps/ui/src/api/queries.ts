// TanStack Query v5 — query keys + hooks for reads and mutations
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// ---- Query key factory ----
export const queryKeys = {
  deposits: (params?: Record<string, unknown>) => ['deposits', params] as const,
  deposit: (id: string) => ['deposits', id] as const,
  withdrawals: (params?: Record<string, unknown>) => ['withdrawals', params] as const,
  withdrawal: (id: string) => ['withdrawals', id] as const,
  users: (params?: Record<string, unknown>) => ['users', params] as const,
  transactions: (params?: Record<string, unknown>) => ['transactions', params] as const,
  auditLogs: (params?: Record<string, unknown>) => ['audit', params] as const,
  sweepJobs: () => ['sweep'] as const,
  multisigQueue: () => ['multisig'] as const,
  signers: () => ['signers'] as const,
  dashboardStats: () => ['dashboard', 'stats'] as const,
  killSwitch: () => ['ops', 'killSwitch'] as const,
  opsHealth: () => ['ops', 'health'] as const,
  coldBalances: () => ['cold', 'balances'] as const,
};

// ---- Query types ----

export interface CreateWithdrawalBody {
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  destinationAddr: string;
  sourceTier: 'hot' | 'cold';
}

export interface ApproveWithdrawalBody {
  signature: string;
  signerAddress: string;
  signedAt: string;
  multisigOpId: string;
  chain: 'bnb' | 'sol';
  /** Slice 7: base64 HW attestation blob — required for cold-tier, omitted for hot-tier */
  attestationBlob?: string;
  /** Slice 7: hardware device type */
  attestationType?: 'ledger' | 'trezor';
}

export interface WithdrawalApproveResult {
  op: { id: string; collectedSigs: number; requiredSigs: number; status: string };
  progress: string;
  thresholdMet: boolean;
}

export interface WithdrawalExecuteResult {
  jobId: string;
}

// ---- Read hooks ----

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

// ---- Mutation hooks ----

/** POST /withdrawals — create a new withdrawal request */
export function useCreateWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWithdrawalBody) =>
      api.post<{ withdrawal: unknown; multisigOpId: string }>('/withdrawals', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** POST /withdrawals/:id/approve — submit treasurer signature */
export function useApproveWithdrawal(withdrawalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApproveWithdrawalBody) =>
      api.post<WithdrawalApproveResult>(`/withdrawals/${withdrawalId}/approve`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
    },
  });
}

// ---- Ops types ----

export interface KillSwitchState {
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export interface KillSwitchToggleBody {
  enabled: boolean;
  reason?: string;
}

export type ProbeStatus = 'ok' | 'error';

export interface ChainHealth {
  id: string;
  rpc: string;
  latestBlock: number | null;
  checkpointBlock: number | null;
  lagBlocks: number | null;
  status: ProbeStatus;
  error?: string;
}

export interface QueueHealth {
  name: string;
  depth: number;
  status: ProbeStatus;
  error?: string;
}

export interface WorkerHealth {
  name: string;
  lastHeartbeatAgoSec: number | null;
  status: ProbeStatus;
  error?: string;
}

export interface OpsHealth {
  db: { status: ProbeStatus; error?: string };
  redis: { status: ProbeStatus; error?: string };
  policyEngine: { status: ProbeStatus; error?: string };
  chains: ChainHealth[];
  queues: QueueHealth[];
  workers: WorkerHealth[];
}

// ---- Ops hooks ----

export function useKillSwitch() {
  return useQuery({
    queryKey: queryKeys.killSwitch(),
    queryFn: () => api.get<KillSwitchState>('/ops/kill-switch'),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

export function useOpsHealth() {
  return useQuery({
    queryKey: queryKeys.opsHealth(),
    queryFn: () => api.get<OpsHealth>('/ops/health'),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

export function useToggleKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: KillSwitchToggleBody) => api.post<KillSwitchState>('/ops/kill-switch', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops'] });
    },
  });
}

/** POST /withdrawals/:id/execute — enqueue broadcast job */
export function useExecuteWithdrawal(withdrawalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WithdrawalExecuteResult>(`/withdrawals/${withdrawalId}/execute`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---- Cold balance types ----

export interface ColdBalanceEntry {
  chain: 'bnb' | 'sol';
  tier: 'hot' | 'cold';
  address: string;
  token: 'USDT' | 'USDC';
  balance: string;
  lastCheckedAt: string;
  stale?: boolean;
}

export interface RebalanceBody {
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amountMinor: string;
}

export interface RebalanceResult {
  withdrawalId: string;
  multisigOpId: string;
  destinationAddr: string;
  status: string;
}

export interface CancelWithdrawalBody {
  reason?: string;
}

// ---- Cold balance hooks ----

/** GET /cold/balances — 30s refetch interval matches backend cache */
export function useColdBalances() {
  return useQuery({
    queryKey: queryKeys.coldBalances(),
    queryFn: () => api.get<{ data: ColdBalanceEntry[] }>('/cold/balances').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** POST /rebalance — hot→cold rebalance; triggers WebAuthn step-up via api client */
export function useRebalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RebalanceBody) => api.post<RebalanceResult>('/rebalance', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cold'] });
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
    },
  });
}

/** POST /withdrawals/:id/cancel */
export function useCancelWithdrawal(withdrawalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: CancelWithdrawalBody) =>
      api.post<{ ok: boolean }>(`/withdrawals/${withdrawalId}/cancel`, body ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
    },
  });
}
