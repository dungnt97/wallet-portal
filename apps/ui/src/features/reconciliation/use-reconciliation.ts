// TanStack Query hooks for reconciliation — snapshot list, detail, trigger, cancel
import {
  cancelSnapshot,
  fetchSnapshotDetail,
  fetchSnapshots,
  triggerSnapshot,
} from '@/api/reconciliation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RunSnapshotBody } from '@wp/shared-types';

// ── Query keys ────────────────────────────────────────────────────────────────

export const reconKeys = {
  all: ['reconciliation'] as const,
  list: (page?: number, status?: string) => ['reconciliation', 'list', page, status] as const,
  detail: (id: string) => ['reconciliation', 'detail', id] as const,
};

// ── Read hooks ────────────────────────────────────────────────────────────────

/** Fetch paginated snapshot list */
export function useSnapshotList(page = 1, status?: string) {
  return useQuery({
    queryKey: reconKeys.list(page, status),
    queryFn: () => fetchSnapshots({ page, limit: 20, status: status as never }),
    staleTime: 15_000,
  });
}

/** Fetch snapshot detail + drift rows */
export function useSnapshotDetail(id: string | null) {
  return useQuery({
    queryKey: reconKeys.detail(id ?? ''),
    queryFn: () => fetchSnapshotDetail(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/** Enqueue an ad-hoc reconciliation snapshot */
export function useTriggerSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RunSnapshotBody) => triggerSnapshot(body),
    onSuccess: () => {
      // Invalidate list so the new running snapshot appears
      void qc.invalidateQueries({ queryKey: reconKeys.all });
    },
  });
}

/** Cancel a running snapshot */
export function useCancelSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelSnapshot(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reconKeys.all });
    },
  });
}
