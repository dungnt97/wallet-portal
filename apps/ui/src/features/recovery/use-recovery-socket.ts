// Socket.io listener for recovery events — invalidates stuck-tx query and shows toasts.
// Events handled (emitted by admin-api recovery routes):
//   recovery.bump.submitted   — bump action broadcast, list may have changed
//   recovery.cancel.submitted — cancel action broadcast, list may have changed
//   recovery.action.confirmed — action confirmed on-chain
//   recovery.action.failed    — action failed; ops should investigate
import { connectSocket, disconnectSocket } from '@/api/socket';
import { useToast } from '@/components/overlays';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RECOVERY_QUERY_KEY } from './use-recovery';

export function useRecoverySocket(): void {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const socket = connectSocket();

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: [RECOVERY_QUERY_KEY] });
    };

    const onBumpSubmitted = () => {
      invalidate();
    };

    const onCancelSubmitted = () => {
      invalidate();
    };

    const onActionConfirmed = (data: { entityType?: string; entityId?: string }) => {
      invalidate();
      toast(
        t('recovery.socket.confirmed', {
          type: data.entityType ?? '',
          id: (data.entityId ?? '').slice(0, 8),
        }),
        'success'
      );
    };

    const onActionFailed = (data: { entityType?: string; entityId?: string }) => {
      invalidate();
      toast(
        t('recovery.socket.failed', {
          type: data.entityType ?? '',
          id: (data.entityId ?? '').slice(0, 8),
        }),
        'error'
      );
    };

    socket.on('recovery.bump.submitted', onBumpSubmitted);
    socket.on('recovery.cancel.submitted', onCancelSubmitted);
    socket.on('recovery.action.confirmed', onActionConfirmed);
    socket.on('recovery.action.failed', onActionFailed);

    return () => {
      socket.off('recovery.bump.submitted', onBumpSubmitted);
      socket.off('recovery.cancel.submitted', onCancelSubmitted);
      socket.off('recovery.action.confirmed', onActionConfirmed);
      socket.off('recovery.action.failed', onActionFailed);
      disconnectSocket();
    };
  }, [qc, toast, t]);
}
