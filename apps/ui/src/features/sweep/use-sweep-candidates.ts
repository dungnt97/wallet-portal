import { api } from '@/api/client';
// TanStack Query hook — fetches /sweeps/candidates for the current chain/token filter.
import { useQuery } from '@tanstack/react-query';

export interface SweepCandidate {
  userAddressId: string;
  userId: string;
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string | null;
  creditedUsdt: string;
  creditedUsdc: string;
  estimatedUsd: number;
}

interface SweepCandidatesResponse {
  data: SweepCandidate[];
  total: number;
}

export const SWEEP_CANDIDATES_QUERY_KEY = (chain?: 'bnb' | 'sol', token?: 'USDT' | 'USDC') =>
  ['sweeps', 'candidates', chain, token] as const;

export function useSweepCandidates(chain?: 'bnb' | 'sol', token?: 'USDT' | 'USDC') {
  const params = new URLSearchParams();
  if (chain) params.set('chain', chain);
  if (token) params.set('token', token);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: SWEEP_CANDIDATES_QUERY_KEY(chain, token),
    queryFn: () => api.get<SweepCandidatesResponse>(`/sweeps/candidates${qs}`),
    staleTime: 30_000,
    // Fallback to empty list on error so page still renders
    placeholderData: { data: [], total: 0 },
  });
}
