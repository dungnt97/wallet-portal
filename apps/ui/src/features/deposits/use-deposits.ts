// TanStack Query hook for deposits — real API fetch with 5s polling interval
// Invalidated on Socket.io 'deposit.credited' event via socket-listener.ts
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export interface Deposit {
  id: string;
  userId: string;
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
}

export const DEPOSITS_QUERY_KEY = 'deposits';

export function useDeposits(params: DepositsParams = {}): UseQueryResult<DepositsResponse> {
  const { page = 1, limit = 20, status, chain, token } = params;

  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (status) searchParams.set('status', status);
  if (chain) searchParams.set('chain', chain);
  if (token) searchParams.set('token', token);

  return useQuery<DepositsResponse>({
    queryKey: [DEPOSITS_QUERY_KEY, params],
    queryFn: () => api.get<DepositsResponse>(`/deposits?${searchParams.toString()}`),
    // Poll every 5s as fallback when socket event is missed (e.g. tab backgrounded)
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}
