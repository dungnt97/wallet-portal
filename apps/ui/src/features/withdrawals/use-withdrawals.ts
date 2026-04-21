// Withdrawals data hook — fetches from GET /withdrawals, adapts to WithdrawalRow.
// Socket invalidation keeps the table live without manual refresh.
import { api } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/api/socket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { WithdrawalRow, WithdrawalStage } from './withdrawal-types';

export type { WithdrawalRow } from './withdrawal-types';

export const WITHDRAWALS_QUERY_KEY = 'withdrawals';

// ── API response shape (matches admin-api Withdrawal Zod schema) ──────────────

export interface ApiWithdrawal {
  id: string;
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  toAddress: string;
  status:
    | 'pending'
    | 'approved'
    | 'time_locked'
    | 'executing'
    | 'broadcast'
    | 'cancelling'
    | 'completed'
    | 'cancelled'
    | 'failed';
  multisigOpId: string | null;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
  /** Optional fields present on detailed responses */
  sourceTier?: 'hot' | 'cold';
  timeLockExpiresAt?: string;
  collectedSigs?: number;
  requiredSigs?: number;
}

interface WithdrawalsResponse {
  data: ApiWithdrawal[];
  total: number;
  page: number;
}

// ── Status → stage mapping ────────────────────────────────────────────────────

function apiStatusToStage(status: ApiWithdrawal['status']): WithdrawalStage {
  switch (status) {
    case 'pending':
      return 'awaiting_signatures';
    case 'approved':
      return 'awaiting_signatures';
    case 'time_locked':
      return 'time_locked';
    case 'executing':
      return 'executing';
    case 'broadcast':
      return 'broadcast';
    case 'cancelling':
      return 'cancelling';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'draft';
  }
}

// ── Adapter: ApiWithdrawal → WithdrawalRow ────────────────────────────────────

export function apiToWithdrawalRow(w: ApiWithdrawal): WithdrawalRow {
  return {
    id: w.id,
    chain: w.chain,
    token: w.token,
    amount: Number.parseFloat(w.amount) || 0,
    destination: w.toAddress,
    stage: apiStatusToStage(w.status),
    risk: 'low',
    createdAt: w.createdAt,
    requestedBy: w.userId,
    multisig: {
      required: w.requiredSigs ?? 2,
      total: 3,
      collected: w.collectedSigs ?? 0,
      approvers: [],
      rejectedBy: null,
    },
    txHash: w.txHash,
    note: null,
    multisigOpId: w.multisigOpId ?? undefined,
    sourceTier: w.sourceTier,
    timeLockExpiresAt: w.timeLockExpiresAt,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useWithdrawals() {
  return useQuery<WithdrawalRow[]>({
    queryKey: [WITHDRAWALS_QUERY_KEY],
    queryFn: async () => {
      const res = await api.get<WithdrawalsResponse>('/withdrawals?limit=100');
      return (res.data ?? []).map(apiToWithdrawalRow);
    },
    staleTime: 30_000,
  });
}

// ── Socket listener ───────────────────────────────────────────────────────────

/**
 * Subscribe to all withdrawal + multisig Socket.io events and invalidate
 * TanStack Query caches so the table updates live without manual refresh.
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

    socket.on('withdrawal.created', invalidateAll);
    socket.on('withdrawal.approved', invalidateAll);
    socket.on('withdrawal.executing', invalidateAll);
    socket.on('withdrawal.broadcast', invalidateAll);
    socket.on('withdrawal.confirmed', invalidateAll);
    socket.on('withdrawal.cancelled', invalidateAll);
    socket.on('multisig.progress', invalidateAll);

    // Legacy event names (prototype socket listener compat)
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
