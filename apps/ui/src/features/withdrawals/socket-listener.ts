import { connectSocket, disconnectSocket } from '@/api/socket';
import { useToast } from '@/components/overlays';
// Withdrawal socket listener — standalone module that mirrors the deposits pattern.
// Import and call useWithdrawalSocketEvents() in any component that needs live updates.
// Uses the ref-counted connectSocket/disconnectSocket to share one WS connection.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// ── Payload shapes emitted by admin-api ──────────────────────────────────────

interface WithdrawalCreatedPayload {
  id: string;
  userId: string;
  chain: string;
  token: string;
  amount: string;
  status: string;
}

interface WithdrawalApprovedPayload {
  withdrawalId: string;
  multisigOpId: string;
  progress: string;
  thresholdMet: boolean;
  collectedSigs: number;
  requiredSigs: number;
}

interface WithdrawalBroadcastPayload {
  withdrawalId: string;
  txHash: string;
  status: string;
}

interface WithdrawalConfirmedPayload {
  withdrawalId: string;
  status: string;
}

/**
 * Hook that subscribes to all withdrawal lifecycle Socket.io events,
 * invalidates TanStack Query caches, and shows toast notifications for
 * broadcast + confirmed events the current user cares about.
 *
 * Mount once at page level (WithdrawalsPage already calls useWithdrawalsSocketListener
 * from use-withdrawals.ts for cache invalidation; this module adds the toast layer).
 */
export function useWithdrawalSocketEvents(): void {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const socket = connectSocket();

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
      void qc.invalidateQueries({ queryKey: ['multisig'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const onCreated = (_payload: WithdrawalCreatedPayload) => {
      invalidate();
    };

    const onApproved = (_payload: WithdrawalApprovedPayload) => {
      invalidate();
    };

    const onBroadcast = (payload: WithdrawalBroadcastPayload) => {
      invalidate();
      toast(
        t('withdrawals.broadcastReceived', { hash: `${payload.txHash.slice(0, 14)}…` }),
        'success'
      );
    };

    const onConfirmed = (_payload: WithdrawalConfirmedPayload) => {
      invalidate();
      toast(t('withdrawals.confirmed'), 'success');
    };

    const onExecuting = () => {
      invalidate();
    };

    const onCancelled = () => {
      invalidate();
    };

    const onMultisigProgress = () => {
      invalidate();
    };

    socket.on('withdrawal.created', onCreated);
    socket.on('withdrawal.approved', onApproved);
    socket.on('withdrawal.broadcast', onBroadcast);
    socket.on('withdrawal.confirmed', onConfirmed);
    socket.on('withdrawal.executing', onExecuting);
    socket.on('withdrawal.cancelled', onCancelled);
    socket.on('multisig.progress', onMultisigProgress);

    return () => {
      socket.off('withdrawal.created', onCreated);
      socket.off('withdrawal.approved', onApproved);
      socket.off('withdrawal.broadcast', onBroadcast);
      socket.off('withdrawal.confirmed', onConfirmed);
      socket.off('withdrawal.executing', onExecuting);
      socket.off('withdrawal.cancelled', onCancelled);
      socket.off('multisig.progress', onMultisigProgress);
      disconnectSocket();
    };
  }, [qc, t, toast]);
}
