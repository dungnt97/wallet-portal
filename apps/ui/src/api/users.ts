// Users API — typed fetchers + React Query hooks for user management (Slice 8).
// All calls go through /api proxy → admin-api :3001.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type KycTier = 'none' | 'basic' | 'enhanced';
export type UserStatus = 'active' | 'suspended' | 'closed';

export interface UserRecord {
  id: string;
  email: string;
  kycTier: KycTier;
  riskScore: number;
  status: UserStatus;
  createdAt: string;
}

export interface DerivedAddress {
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string;
  derivationIndex: number;
}

export interface AddressWithBalance {
  id: string;
  userId: string;
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string | null;
  derivationIndex: number;
  tier: 'hot' | 'cold';
  createdAt: string;
  balance: { USDT: string | null; USDC: string | null } | null;
  cached: boolean;
}

export interface UserBalance {
  USDT: string;
  USDC: string;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  q?: string;
  kycTier?: KycTier;
  status?: UserStatus;
  createdFrom?: string;
  createdTo?: string;
}

export interface UserListResp {
  data: UserRecord[];
  total: number;
  page: number;
}

export interface CreateUserBody {
  email: string;
  kycTier?: KycTier;
}

export interface CreateUserResp {
  user: UserRecord;
  addresses: DerivedAddress[];
}

export interface UserDetailResp {
  user: UserRecord;
  addressCount: number;
}

export interface RetryDeriveResp {
  addresses: DerivedAddress[];
  alreadyComplete: boolean;
}

// ── KYC label map (UI display only — values stay 'none'|'basic'|'enhanced') ──
export const KYC_LABELS: Record<KycTier, string> = {
  none: 'None',
  basic: 'T1 Basic',
  enhanced: 'T3 Enhanced',
};

// ── Query key factory ─────────────────────────────────────────────────────────

export const userKeys = {
  list: (params?: UserListParams) => ['users', 'list', params] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  balance: (id: string) => ['users', 'balance', id] as const,
  addresses: (id: string) => ['users', 'addresses', id] as const,
};

// ── Raw fetchers ──────────────────────────────────────────────────────────────

function buildQuery(params: UserListParams): string {
  const p = new URLSearchParams();
  if (params.page != null) p.set('page', String(params.page));
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.q) p.set('q', params.q);
  if (params.kycTier) p.set('kycTier', params.kycTier);
  if (params.status) p.set('status', params.status);
  if (params.createdFrom) p.set('createdFrom', params.createdFrom);
  if (params.createdTo) p.set('createdTo', params.createdTo);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export const usersApi = {
  list: (params: UserListParams = {}) => api.get<UserListResp>(`/users${buildQuery(params)}`),
  get: (id: string) => api.get<UserDetailResp>(`/users/${id}`),
  create: (body: CreateUserBody) => api.post<CreateUserResp>('/users', body),
  updateKyc: (id: string, kycTier: KycTier) =>
    api.patch<{ user: UserRecord }>(`/users/${id}/kyc`, { kycTier }),
  getBalance: (id: string) => api.get<UserBalance>(`/users/${id}/balance`),
  getAddresses: (id: string) =>
    api.get<{ addresses: AddressWithBalance[] }>(`/users/${id}/addresses`),
  retryDerive: (id: string) => api.post<RetryDeriveResp>(`/users/${id}/derive-addresses`),
};

// ── React Query hooks ─────────────────────────────────────────────────────────

/** Paginated user list with server-side filters */
export function useUserList(params: UserListParams = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => usersApi.list(params),
    staleTime: 30_000,
  });
}

/** Single user detail + address count */
export function useUserDetail(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => usersApi.get(id),
    staleTime: 30_000,
    enabled: !!id,
  });
}

/** Ledger-derived balance per currency */
export function useUserBalance(id: string) {
  return useQuery({
    queryKey: userKeys.balance(id),
    queryFn: () => usersApi.getBalance(id),
    staleTime: 15_000,
    enabled: !!id,
  });
}

/** Per-chain addresses with Redis-cached on-chain balance */
export function useUserAddresses(id: string) {
  return useQuery({
    queryKey: userKeys.addresses(id),
    queryFn: () => usersApi.getAddresses(id),
    staleTime: 30_000,
    enabled: !!id,
  });
}

/** POST /users — create end-user + trigger HD derivation */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => usersApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** PATCH /users/:id/kyc — update KYC tier */
export function useUpdateKyc(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kycTier: KycTier) => usersApi.updateKyc(userId, kycTier),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.detail(userId) });
      void qc.invalidateQueries({ queryKey: ['users', 'list'] });
    },
  });
}

/** POST /users/:id/derive-addresses — idempotent retry */
export function useRetryDerive(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => usersApi.retryDerive(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.addresses(userId) });
      void qc.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}
