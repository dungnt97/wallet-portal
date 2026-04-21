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
  sweepBatches: () => ['sweep', 'batches'] as const,
  multisigQueue: (params?: Record<string, unknown>) => ['multisig', params] as const,
  signers: () => ['signers'] as const,
  dashboardStats: () => ['dashboard', 'stats'] as const,
  dashboardMetrics: () => ['dashboard', 'metrics'] as const,
  killSwitch: () => ['ops', 'killSwitch'] as const,
  opsHealth: () => ['ops', 'health'] as const,
  coldBalances: () => ['cold', 'balances'] as const,
  rebalanceHistory: () => ['rebalance', 'history'] as const,
  staff: () => ['staff'] as const,
  loginHistory: () => ['staff', 'loginHistory'] as const,
  notifChannels: () => ['notif', 'channels'] as const,
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

// ---- Dashboard metrics ----

export interface DashboardMetrics {
  aumUsdt: string;
  aumUsdc: string;
  pendingDeposits: number;
  pendingDepositsValue: string;
  pendingWithdrawals: number;
  pendingMultisigOps: number;
  blockSyncBnb: number | null;
  blockSyncSol: number | null;
}

/** GET /dashboard/metrics — real aggregates from DB */
export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.dashboardMetrics(),
    queryFn: () => api.get<DashboardMetrics>('/dashboard/metrics'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ---- Multisig ops ----

export interface MultisigOpRow {
  id: string;
  withdrawalId: string | null;
  chain: 'bnb' | 'sol';
  operationType: string;
  multisigAddr: string;
  requiredSigs: number;
  collectedSigs: number;
  expiresAt: string;
  status: 'pending' | 'collecting' | 'ready' | 'submitted' | 'confirmed' | 'expired' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface MultisigOpsPage {
  data: MultisigOpRow[];
  total: number;
  page: number;
}

export interface MultisigOpsParams {
  page?: number;
  limit?: number;
  status?: MultisigOpRow['status'];
}

/** GET /multisig-ops — paginated list from DB */
export function useMultisigOps(params: MultisigOpsParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  const q = qs.toString();
  return useQuery({
    queryKey: queryKeys.multisigQueue(params as Record<string, unknown>),
    queryFn: () => api.get<MultisigOpsPage>(`/multisig-ops${q ? `?${q}` : ''}`),
    staleTime: 15_000,
  });
}

// ---- Staff list ----

export interface StaffMemberRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'treasurer' | 'operator' | 'viewer';
  status: 'active' | 'suspended';
  /** Initials derived client-side */
  initials: string;
}

export interface StaffListPage {
  data: StaffMemberRow[];
  total: number;
  page: number;
}

/** GET /staff — paginated staff directory */
export function useStaffList(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit ?? 100));
  const q = qs.toString();
  return useQuery({
    queryKey: queryKeys.staff(),
    queryFn: () => api.get<StaffListPage>(`/staff${q ? `?${q}` : '?limit=100'}`),
    staleTime: 60_000,
  });
}

// ---- Sweep batches ----

export interface SweepBatchRow {
  id: string;
  chain: 'bnb' | 'sol';
  addresses: number;
  total: number;
  fee: number;
  status: 'completed' | 'partial' | 'pending' | 'failed';
  createdAt: string;
  executedAt: string | null;
}

/** GET /sweeps/batches — recent sweep batch history */
export function useSweepBatches(chain?: 'bnb' | 'sol') {
  const qs = chain ? `?chain=${chain}&limit=10` : '?limit=10';
  return useQuery({
    queryKey: queryKeys.sweepBatches(),
    queryFn: () =>
      api
        .get<{ data: SweepBatchRow[] }>(`/sweeps/batches${qs}`)
        .catch(() => ({ data: [] as SweepBatchRow[] })),
    staleTime: 30_000,
  });
}

// ---- Transactions (unified ledger) ----

export type TxType = 'deposit' | 'withdrawal' | 'sweep';
export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface TxRow {
  id: string;
  type: TxType;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
  status: TxStatus;
  fee: number;
  timestamp: string;
}

export interface TransactionsPage {
  data: TxRow[];
  total: number;
  page: number;
}

export interface TransactionsParams {
  page?: number;
  limit?: number;
  type?: TxType;
  chain?: 'bnb' | 'sol';
  status?: TxStatus;
}

/** GET /transactions — unified ledger (deposits + withdrawals + sweeps) */
export function useTransactions(params: TransactionsParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.type) qs.set('type', params.type);
  if (params.chain) qs.set('chain', params.chain);
  if (params.status) qs.set('status', params.status);
  const q = qs.toString();
  return useQuery({
    queryKey: queryKeys.transactions(params as Record<string, unknown>),
    queryFn: () => api.get<TransactionsPage>(`/transactions${q ? `?${q}` : ''}`),
    staleTime: 30_000,
  });
}

// ---- Rebalance history ----

export interface RebalanceHistoryRow {
  id: string;
  chain: 'bnb' | 'sol';
  direction: 'hot→cold' | 'cold→hot';
  amount: number;
  createdAt: string;
  executedAt: string | null;
  sigs: number;
  status: 'awaiting_signatures' | 'completed' | 'failed';
  txHash: string | null;
  proposer: string;
}

/** GET /rebalance/history — past rebalance ops */
export function useRebalanceHistory() {
  return useQuery({
    queryKey: queryKeys.rebalanceHistory(),
    queryFn: () =>
      api
        .get<{ data: RebalanceHistoryRow[] }>('/rebalance/history')
        .catch(() => ({ data: [] as RebalanceHistoryRow[] })),
    staleTime: 60_000,
  });
}

// ---- Staff login history ----

export interface LoginHistoryRow {
  id: string;
  staffId: string;
  staffName: string;
  email: string;
  ip: string;
  userAgent: string;
  result: 'success' | 'failed' | 'mfa_failed';
  at: string;
}

/** GET /staff/login-history — recent sign-in events for audit */
export function useLoginHistory(params: { limit?: number } = {}) {
  const qs = params.limit ? `?limit=${params.limit}` : '?limit=50';
  return useQuery({
    queryKey: queryKeys.loginHistory(),
    queryFn: () =>
      api
        .get<{ data: LoginHistoryRow[] }>(`/staff/login-history${qs}`)
        .catch(() => ({ data: [] as LoginHistoryRow[] })),
    staleTime: 60_000,
  });
}

// ---- Notification channels ----

export type ChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';

export interface NotifChannel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  filter: string;
}

export interface NotifEventKind {
  id: string;
  label: string;
  severity: 'info' | 'warn' | 'err';
  routed: ChannelKind[];
}

export interface NotifChannelsResponse {
  channels: NotifChannel[];
  eventKinds: NotifEventKind[];
}

/** GET /notification-channels — channel routing matrix */
export function useNotifChannels() {
  return useQuery({
    queryKey: queryKeys.notifChannels(),
    queryFn: () => api.get<NotifChannelsResponse>('/notification-channels').catch(() => null),
    staleTime: 60_000,
  });
}

/** PATCH /notification-channels/:id — toggle channel enabled state */
export function useToggleNotifChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<NotifChannel>(`/notification-channels/${id}`, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifChannels() });
    },
  });
}
