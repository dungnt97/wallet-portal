import { api } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/api/socket';
// Withdrawals data hook — fetches from GET /withdrawals and falls back to
// prototype fixtures when the API is empty / disabled.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FIX_WITHDRAWALS, type FixWithdrawal } from '../_shared/fixtures';

export const WITHDRAWALS_QUERY_KEY = 'withdrawals';

interface WithdrawalsResponse {
  data: FixWithdrawal[];
  total: number;
}

export function useWithdrawals() {
  return useQuery<FixWithdrawal[]>({
    queryKey: [WITHDRAWALS_QUERY_KEY],
    queryFn: async () => {
      try {
        const res = await api.get<WithdrawalsResponse>('/withdrawals?limit=100');
        return res.data && res.data.length > 0 ? res.data : FIX_WITHDRAWALS;
      } catch {
        return FIX_WITHDRAWALS;
      }
    },
    staleTime: 30_000,
  });
}

/** Subscribe to withdrawal.submitted / .approved / .executed events */
export function useWithdrawalsSocketListener(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = connectSocket();
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: [WITHDRAWALS_QUERY_KEY] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    socket.on('withdrawals.submitted', invalidate);
    socket.on('withdrawals.approved', invalidate);
    socket.on('withdrawals.executed', invalidate);
    socket.on('multisig.approval', invalidate);
    return () => {
      socket.off('withdrawals.submitted', invalidate);
      socket.off('withdrawals.approved', invalidate);
      socket.off('withdrawals.executed', invalidate);
      socket.off('multisig.approval', invalidate);
      disconnectSocket();
    };
  }, [qc]);
}
