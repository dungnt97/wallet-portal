// ops socket listener — subscribes to ops.killswitch.changed and invalidates
// the killSwitch query so the toggle card reflects reality in real time.
import { connectSocket, disconnectSocket } from '@/api/socket';
import { useToast } from '@/components/overlays';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface KillSwitchChangedPayload {
  enabled: boolean;
  reason: string | null;
  updatedAt: string;
}

export function useOpsSocket(): void {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const socket = connectSocket();

    const onKillSwitchChanged = (payload: KillSwitchChangedPayload) => {
      void qc.invalidateQueries({ queryKey: ['ops'] });
      const msg = payload.enabled
        ? t('ops.killSwitch.toastEnabled')
        : t('ops.killSwitch.toastDisabled');
      toast(msg, payload.enabled ? 'error' : 'success');
    };

    socket.on('ops.killswitch.changed', onKillSwitchChanged);

    return () => {
      socket.off('ops.killswitch.changed', onKillSwitchChanged);
      disconnectSocket();
    };
  }, [qc, t, toast]);
}
