// Recovery data hook — wraps TanStack Query for GET /recovery/stuck.
// Polls every 30s as fallback; Socket.io invalidation wired in use-recovery-socket.ts.
import { bumpTx, cancelTx, fetchStuckTxs } from '@/api/recovery';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StuckTxItem } from '@wp/shared-types';

export const RECOVERY_QUERY_KEY = 'recovery.stuck' as const;

// ── Read ──────────────────────────────────────────────────────────────────────

export function useStuckTxs() {
  return useQuery({
    queryKey: [RECOVERY_QUERY_KEY],
    queryFn: fetchStuckTxs,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface BumpMutationVars {
  item: StuckTxItem;
  idempotencyKey: string;
}

/** Sends POST /recovery/:entityType/:entityId/bump and invalidates stuck-tx list on success. */
export function useBumpTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, idempotencyKey }: BumpMutationVars) =>
      bumpTx(item.entityType, item.entityId, { idempotencyKey }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RECOVERY_QUERY_KEY] });
    },
  });
}

export interface CancelMutationVars {
  item: StuckTxItem;
  idempotencyKey: string;
}

/** Sends POST /recovery/:entityType/:entityId/cancel and invalidates stuck-tx list on success. */
export function useCancelTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, idempotencyKey }: CancelMutationVars) =>
      cancelTx(item.entityType, item.entityId, { idempotencyKey }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RECOVERY_QUERY_KEY] });
    },
  });
}
