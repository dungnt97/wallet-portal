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
  dashboardHistory: (metric: string, range: string) =>
    ['dashboard', 'history', metric, range] as const,
  killSwitch: () => ['ops', 'killSwitch'] as const,
  opsHealth: () => ['ops', 'health'] as const,
  coldBalances: () => ['cold', 'balances'] as const,
  coldWallets: () => ['cold', 'wallets'] as const,
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
  /** Direction of the rebalance — defaults to hot_to_cold on the server */
  direction?: 'hot_to_cold' | 'cold_to_hot';
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

// ---- Cold wallet metadata (pairs with band thresholds) ----

export interface ColdWalletMeta {
  chain: 'bnb' | 'sol';
  tier: 'hot' | 'cold';
  address: string;
  multisigAddr: string | null;
  /** Band floor in USD — only populated for hot wallets */
  bandFloorUsd: number | null;
  /** Band ceiling in USD — only populated for hot wallets */
  bandCeilingUsd: number | null;
  /** e.g. "Gnosis Safe · 3/5 signers" — only populated for cold wallets */
  signerLabel: string | null;
  /** e.g. "HSM · Zürich vault" — only populated for cold wallets */
  geographicLabel: string | null;
}

/** GET /cold/wallets — wallet pair metadata with band thresholds */
export function useColdWallets() {
  return useQuery({
    queryKey: queryKeys.coldWallets(),
    queryFn: () => api.get<{ data: ColdWalletMeta[] }>('/cold/wallets').then((r) => r.data),
    staleTime: 60_000,
  });
}

/** POST /cold/band-check/run — flush cache + re-probe balances */
export function useRunBandCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: ColdBalanceEntry[]; triggeredAt: string }>('/cold/band-check/run'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.coldBalances() });
    },
  });
}

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
  aumBreakdown: {
    usdtBnb: string;
    usdcBnb: string;
    usdtSol: string;
    usdcSol: string;
  };
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

// ---- Dashboard history (time-series for chart) ----

export type DashboardHistoryMetric = 'aum' | 'deposits' | 'withdrawals';
export type DashboardHistoryRange = '24h' | '7d' | '30d' | '90d';

export interface HistoryPoint {
  t: string;
  v: number;
}

export interface DashboardHistory {
  metric: DashboardHistoryMetric;
  range: DashboardHistoryRange;
  points: HistoryPoint[];
}

/** GET /dashboard/history?metric=...&range=... — time-bucketed real data from DB */
export function useDashboardHistory(metric: DashboardHistoryMetric, range: DashboardHistoryRange) {
  return useQuery({
    queryKey: queryKeys.dashboardHistory(metric, range),
    queryFn: () =>
      api
        .get<DashboardHistory>(`/dashboard/history?metric=${metric}&range=${range}`)
        .catch(() => ({ metric, range, points: [] as HistoryPoint[] })),
    staleTime: 60_000,
    refetchInterval: 60_000,
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
  /** Real total active signers for this chain from staff_signing_keys (M6 fix). */
  totalSigners?: number;
  expiresAt: string;
  status: 'pending' | 'collecting' | 'ready' | 'submitted' | 'confirmed' | 'expired' | 'failed';
  createdAt: string;
  updatedAt: string;
  /** Populated when op is linked to a withdrawal (M6 fix). */
  withdrawalAmount?: string | null;
  withdrawalToken?: string | null;
  withdrawalDestination?: string | null;
  withdrawalNonce?: number | null;
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
  /** ISO-8601 timestamp of last successful login — from staffMembers.lastLoginAt */
  lastLoginAt: string | null;
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
  /** Filter by token / asset */
  token?: 'USDT' | 'USDC';
  /** ISO datetime — only transactions on or after this date */
  dateFrom?: string;
  /** ISO datetime — only transactions on or before this date */
  dateTo?: string;
}

/** GET /transactions — unified ledger (deposits + withdrawals + sweeps) */
export function useTransactions(params: TransactionsParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.type) qs.set('type', params.type);
  if (params.chain) qs.set('chain', params.chain);
  if (params.status) qs.set('status', params.status);
  if (params.token) qs.set('token', params.token);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
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

// ---- Notification channels (read — UI routing matrix) ----

export type ChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';
export type NotifSeverityFilter = 'info' | 'warn' | 'err';

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
  severity: NotifSeverityFilter;
  routed: ChannelKind[];
}

export interface NotifChannelsResponse {
  channels: NotifChannel[];
  eventKinds: NotifEventKind[];
}

/** GET /notification-channels — channel routing matrix (read-only, all roles) */
export function useNotifChannels() {
  return useQuery({
    queryKey: queryKeys.notifChannels(),
    queryFn: () => api.get<NotifChannelsResponse>('/notification-channels').catch(() => null),
    staleTime: 60_000,
  });
}

// ---- Admin notification channels CRUD ----

export interface AdminChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  target: string;
  enabled: boolean;
  severityFilter: NotifSeverityFilter;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelBody {
  kind: ChannelKind;
  name: string;
  target: string;
  enabled?: boolean;
  severityFilter?: NotifSeverityFilter;
}

export interface UpdateChannelBody {
  name?: string;
  target?: string;
  enabled?: boolean;
  severityFilter?: NotifSeverityFilter;
}

export interface RoutingRule {
  id: string;
  eventType: string;
  severity: NotifSeverityFilter;
  channelKind: ChannelKind;
  enabled: boolean;
}

export interface UpsertRoutingRuleBody {
  eventType: string;
  severity: NotifSeverityFilter;
  channelKind: ChannelKind;
  enabled: boolean;
}

export const adminNotifQueryKeys = {
  channels: () => ['admin', 'notif', 'channels'] as const,
  routing: () => ['admin', 'notif', 'routing'] as const,
};

/** GET /admin/notification-channels — admin channel list */
export function useAdminChannels() {
  return useQuery({
    queryKey: adminNotifQueryKeys.channels(),
    queryFn: () =>
      api.get<{ data: AdminChannel[] }>('/admin/notification-channels').catch(() => ({ data: [] })),
    staleTime: 30_000,
  });
}

/** POST /admin/notification-channels — create channel */
export function useCreateAdminChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChannelBody) =>
      api.post<AdminChannel>('/admin/notification-channels', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminNotifQueryKeys.channels() });
      void qc.invalidateQueries({ queryKey: queryKeys.notifChannels() });
    },
  });
}

/** PATCH /admin/notification-channels/:id — update channel */
export function useUpdateAdminChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateChannelBody) =>
      api.patch<AdminChannel>(`/admin/notification-channels/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminNotifQueryKeys.channels() });
      void qc.invalidateQueries({ queryKey: queryKeys.notifChannels() });
    },
  });
}

/** DELETE /admin/notification-channels/:id — hard delete */
export function useDeleteAdminChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/admin/notification-channels/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminNotifQueryKeys.channels() });
      void qc.invalidateQueries({ queryKey: queryKeys.notifChannels() });
    },
  });
}

/** POST /admin/notification-channels/:id/test — fire test notification */
export function useTestAdminChannel() {
  return useMutation({
    mutationFn: ({ id, eventType }: { id: string; eventType?: string }) =>
      api.post<{ ok: boolean; channelKind: string }>(`/admin/notification-channels/${id}/test`, {
        eventType,
      }),
  });
}

/** GET /admin/notification-routing — routing rules */
export function useAdminRouting() {
  return useQuery({
    queryKey: adminNotifQueryKeys.routing(),
    queryFn: () =>
      api.get<{ data: RoutingRule[] }>('/admin/notification-routing').catch(() => ({ data: [] })),
    staleTime: 30_000,
  });
}

/** PATCH /admin/notification-routing — upsert a routing rule */
export function useUpsertRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertRoutingRuleBody) =>
      api.patch<RoutingRule>('/admin/notification-routing', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminNotifQueryKeys.routing() });
      void qc.invalidateQueries({ queryKey: queryKeys.notifChannels() });
    },
  });
}

// ---- Nav sidebar counts ----

export interface NavCounts {
  deposits: number;
  sweep: number;
  withdrawals: number;
  multisig: number;
  recovery: number;
}

/** GET /dashboard/nav-counts — badge counts for sidebar navigation */
export function useNavCounts() {
  return useQuery({
    queryKey: ['dashboard', 'nav-counts'] as const,
    queryFn: () => api.get<NavCounts>('/dashboard/nav-counts').catch(() => null),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

// ---- Deposit add-to-sweep mutation ----

/** POST /deposits/:id/add-to-sweep — create sweep trigger for a credited deposit */
export function useAddDepositToSweep(depositId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ sweepId: string; userAddressId: string }>(`/deposits/${depositId}/add-to-sweep`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sweep'] });
      void qc.invalidateQueries({ queryKey: ['deposits'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'nav-counts'] });
    },
  });
}

// ---- Withdrawal reject + submit-draft mutations ----

export interface RejectWithdrawalBody {
  reason?: string;
}

/** POST /withdrawals/:id/reject — treasurer rejects a pending withdrawal */
export function useRejectWithdrawal(withdrawalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: RejectWithdrawalBody) =>
      api.post<{ ok: boolean }>(`/withdrawals/${withdrawalId}/reject`, body ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'nav-counts'] });
    },
  });
}

/** POST /withdrawals/:id/submit — promote draft to pending (awaiting signatures) */
export function useSubmitWithdrawal(withdrawalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; status: string }>(`/withdrawals/${withdrawalId}/submit`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
    },
  });
}

// ---- Multisig approve / reject / execute mutations ----

export interface MultisigApproveBody {
  staffId: string;
  at: string;
}

/** POST /multisig-ops/:id/approve — record a signer approval on a multisig op */
export function useApproveMultisigOp(opId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MultisigApproveBody) =>
      api.post<{
        op: { id: string; collectedSigs: number; requiredSigs: number; status: string };
        thresholdMet: boolean;
      }>(`/multisig-ops/${opId}/approve`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
    },
  });
}

/** POST /multisig-ops/:id/reject — signer rejects a multisig op */
export function useRejectMultisigOp(opId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string }) =>
      api.post<{ ok: boolean }>(`/multisig-ops/${opId}/reject`, body ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['multisig'] });
    },
  });
}

/** POST /multisig-ops/:id/execute — broadcast a ready multisig op */
export function useExecuteMultisigOp(opId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ jobId: string }>(`/multisig-ops/${opId}/execute`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
    },
  });
}

// ---- Wallets registry ----

export interface WalletRow {
  id: string;
  chain: 'bnb' | 'sol';
  address: string;
  tier: 'hot' | 'cold';
  purpose: 'deposit_hd' | 'operational' | 'cold_reserve';
  multisigAddr: string | null;
  derivationPath: string | null;
  policyConfig: Record<string, unknown> | null;
  createdAt: string;
}

export interface WalletsPage {
  data: WalletRow[];
  total: number;
  page: number;
}

/** GET /wallets — registry of custody wallets (hot operational, cold reserve, HD deposit) */
export function useWallets(
  params: { chain?: 'bnb' | 'sol'; tier?: 'hot' | 'cold'; purpose?: string } = {}
) {
  const qs = new URLSearchParams();
  if (params.chain) qs.set('chain', params.chain);
  if (params.tier) qs.set('tier', params.tier);
  if (params.purpose) qs.set('purpose', params.purpose);
  const q = qs.toString();
  return useQuery({
    queryKey: ['wallets', params] as const,
    queryFn: () =>
      api
        .get<WalletsPage>(`/wallets${q ? `?${q}` : ''}`)
        .catch(() => ({ data: [] as WalletRow[], total: 0, page: 1 })),
    staleTime: 60_000,
  });
}

// ---- Ops SLA summary ----

export interface SlaSummary {
  depositCreditP50Sec: number | null;
  sweepConfirmP50Sec: number | null;
  depositsLast24h: number;
  sweepsLast24h: number;
  withdrawalsLast24h: number;
  pendingDeposits: number;
  pendingSweeps: number;
  pendingWithdrawals: number;
}

/** GET /ops/sla-summary — latency aggregates + queue depths from DB */
export function useSlaSummary() {
  return useQuery({
    queryKey: ['ops', 'sla-summary'] as const,
    queryFn: () => api.get<SlaSummary>('/ops/sla-summary').catch(() => null),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

// ---- Ops compliance summary ----

export interface ComplianceSummary {
  kycNone: number;
  kycBasic: number;
  kycEnhanced: number;
  riskLow: number;
  riskMedium: number;
  riskHigh: number;
  riskFrozen: number;
  activeUsers: number;
  suspendedUsers: number;
  totalUsers: number;
}

/** GET /ops/compliance-summary — KYC + risk tier distribution from users table */
export function useComplianceSummary() {
  return useQuery({
    queryKey: ['ops', 'compliance-summary'] as const,
    queryFn: () => api.get<ComplianceSummary>('/ops/compliance-summary').catch(() => null),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });
}

// ---- Signers stats ----

export interface SignerStatRow {
  staffId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActiveAt: string | null;
  sigCount30d: number;
  oldestKeyAgeDays: number | null;
  evmAddr: string | null;
  solAddr: string | null;
}

/** GET /signers/stats — enriched signer stats (last active, sig counts, key age) */
export function useSignersStats() {
  return useQuery({
    queryKey: ['signers', 'stats'] as const,
    queryFn: () =>
      api
        .get<{ data: SignerStatRow[] }>('/signers/stats')
        .catch(() => ({ data: [] as SignerStatRow[] })),
    staleTime: 60_000,
  });
}

// ---- Multisig sync status ----

export type MultisigChainSyncStatus = 'synced' | 'stale' | 'error';

export interface MultisigChainSync {
  status: MultisigChainSyncStatus;
  lastSyncAt: string; // ISO-8601
  nonce?: number; // BNB only
}

export interface MultisigSyncStatus {
  bnb: MultisigChainSync;
  sol: MultisigChainSync;
}

/** Fallback when wallet-engine is unreachable */
function syncStatusFallback(): MultisigSyncStatus {
  const lastSyncAt = new Date().toISOString();
  return {
    bnb: { status: 'error', lastSyncAt },
    sol: { status: 'error', lastSyncAt },
  };
}

/** GET /multisig/sync-status — real Safe nonce + Squads PDA reachability (60s cache) */
export function useMultisigSyncStatus() {
  return useQuery({
    queryKey: ['multisig', 'sync-status'] as const,
    queryFn: () =>
      api.get<MultisigSyncStatus>('/multisig/sync-status').catch(() => syncStatusFallback()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** POST /multisig/sync-refresh — bust wallet-engine cache + re-probe both chains */
export function useRefreshMultisigSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<MultisigSyncStatus>('/multisig/sync-refresh').catch(() => syncStatusFallback()),
    onSuccess: (data) => {
      // Update the sync-status cache immediately with fresh probe result
      qc.setQueryData(['multisig', 'sync-status'], data);
      // Also invalidate multisig ops list so nonce/state refreshes
      void qc.invalidateQueries({ queryKey: ['multisig'] });
    },
  });
}
