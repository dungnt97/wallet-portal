import { api } from '@/api/client';
// TanStack Query hook — fetches 24h gas history from GET /chain/gas-history.
// Returns null current when wallet-engine hasn't sampled yet (cold start / dev).
import { useQuery } from '@tanstack/react-query';

export interface GasPoint {
  t: string; // ISO-8601
  price: number;
}

export interface GasHistoryData {
  points: GasPoint[];
  current: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export const GAS_HISTORY_QUERY_KEY = (chain: 'bnb' | 'sol') =>
  ['chain', 'gas-history', chain] as const;

/** Fetch 24h gas history for the given chain. Refreshes every 5 min (matches sampler cadence). */
export function useGasHistory(chain: 'bnb' | 'sol') {
  return useQuery<GasHistoryData>({
    queryKey: GAS_HISTORY_QUERY_KEY(chain),
    queryFn: () => api.get<GasHistoryData>(`/chain/gas-history?chain=${chain}&range=24h`),
    staleTime: 5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
    // On error: treat as unavailable (current=null)
    placeholderData: { points: [], current: null, avg: null, min: null, max: null },
  });
}
