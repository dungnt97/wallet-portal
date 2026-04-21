// Withdrawals data hook — fetches from GET /withdrawals, falls back to
// prototype fixtures when the API returns empty / errors.
// Socket invalidation is kept here as a thin re-export of the dedicated listener.
import { api } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/api/socket';
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

/**
 * Subscribe to all withdrawal + multisig Socket.io events and invalidate
 * TanStack Query caches so the table updates live without manual refresh.
 *
 * Events handled (emitted by admin-api after each state transition):
 *   withdrawal.created   — new row appeared
 *   withdrawal.approved  — signature recorded / threshold met
 *   withdrawal.executing — execute job enqueued
 *   withdrawal.broadcast — tx submitted to network
 *   withdrawal.confirmed — tx confirmed on-chain
 *   withdrawal.cancelled — row cancelled
 *   multisig.progress    — collected_sigs counter changed
 */
export function useWithdrawalsSocketListener(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const invalidateAll = () => {
      void qc.invalidateQueries({ queryKey: [WITHDRAWALS_QUERY_KEY] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    };

    // All withdrawal lifecycle events → full refetch
    socket.on('withdrawal.created', invalidateAll);
    socket.on('withdrawal.approved', invalidateAll);
    socket.on('withdrawal.executing', invalidateAll);
    socket.on('withdrawal.broadcast', invalidateAll);
    socket.on('withdrawal.confirmed', invalidateAll);
    socket.on('withdrawal.cancelled', invalidateAll);
    socket.on('multisig.progress', invalidateAll);

    // Legacy event names (from prototype socket listener — kept for compat)
    socket.on('withdrawals.submitted', invalidateAll);
    socket.on('withdrawals.approved', invalidateAll);
    socket.on('withdrawals.executed', invalidateAll);
    socket.on('multisig.approval', invalidateAll);

    return () => {
      socket.off('withdrawal.created', invalidateAll);
      socket.off('withdrawal.approved', invalidateAll);
      socket.off('withdrawal.executing', invalidateAll);
      socket.off('withdrawal.broadcast', invalidateAll);
      socket.off('withdrawal.confirmed', invalidateAll);
      socket.off('withdrawal.cancelled', invalidateAll);
      socket.off('multisig.progress', invalidateAll);
      socket.off('withdrawals.submitted', invalidateAll);
      socket.off('withdrawals.approved', invalidateAll);
      socket.off('withdrawals.executed', invalidateAll);
      socket.off('multisig.approval', invalidateAll);
      disconnectSocket();
    };
  }, [qc]);
}
