import { api } from '@/api/client';
// TanStack Query mutation hook — POST /sweeps/trigger with selected candidate IDs.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SWEEP_CANDIDATES_QUERY_KEY } from './use-sweep-candidates';

interface TriggerSweepBody {
  candidate_ids: string[];
}

interface TriggerSweepResult {
  created: Array<{ sweepId: string; userAddressId: string; jobId: string }>;
  skipped: Array<{ userAddressId: string; reason: string }>;
}

export function useSweepTrigger() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: TriggerSweepBody) => api.post<TriggerSweepResult>('/sweeps/trigger', body),
    onSuccess: () => {
      // Invalidate candidates (they will move to active sweep status) and sweep list
      void qc.invalidateQueries({ queryKey: SWEEP_CANDIDATES_QUERY_KEY() });
      void qc.invalidateQueries({ queryKey: ['sweeps'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
