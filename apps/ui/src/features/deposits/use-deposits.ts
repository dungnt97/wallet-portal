// TanStack Query hook for deposits — real API fetch with 5s polling interval
// Invalidated on Socket.io 'deposit.credited' event via socket-listener.ts
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export interface Deposit {
  id: string;
  userId: string;
  /** User email from JOIN — null if user not found */
  userEmail: string | null;
  /** User's on-chain deposit address from JOIN — null if not assigned */
  userAddress: string | null;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  status: 'pending' | 'credited' | 'swept' | 'failed';
  confirmedBlocks: number;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepositsResponse {
  data: Deposit[];
  total: number;
  page: number;
  limit: number;
}

export interface DepositsParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'credited' | 'swept' | 'failed';
  chain?: 'bnb' | 'sol';
  token?: 'USDT' | 'USDC';
  /** Server-side minimum amount filter */
  minAmount?: number;
  /** Server-side maximum amount filter */
  maxAmount?: number;
  /** ISO datetime — only deposits on or after this date */
  dateFrom?: string;
  /** ISO datetime — only deposits on or before this date */
  dateTo?: string;
}

export const DEPOSITS_QUERY_KEY = 'deposits';

export function useDeposits(params: DepositsParams = {}): UseQueryResult<DepositsResponse> {
  const {
    page = 1,
    limit = 20,
    status,
    chain,
    token,
    minAmount,
    maxAmount,
    dateFrom,
    dateTo,
  } = params;

  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (status) searchParams.set('status', status);
  if (chain) searchParams.set('chain', chain);
  if (token) searchParams.set('token', token);
  if (minAmount !== undefined) searchParams.set('minAmount', String(minAmount));
  if (maxAmount !== undefined) searchParams.set('maxAmount', String(maxAmount));
  if (dateFrom) searchParams.set('dateFrom', dateFrom);
  if (dateTo) searchParams.set('dateTo', dateTo);

  return useQuery<DepositsResponse>({
    queryKey: [DEPOSITS_QUERY_KEY, params],
    queryFn: () => api.get<DepositsResponse>(`/deposits?${searchParams.toString()}`),
    // Poll every 5s as fallback when socket event is missed (e.g. tab backgrounded)
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}
