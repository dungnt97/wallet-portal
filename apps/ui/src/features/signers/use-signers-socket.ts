import { connectSocket, disconnectSocket, getSocket } from '@/api/socket';
// Socket.io hook for live signer ceremony updates.
// Listens to events emitted by admin-api on the /stream namespace and invalidates
// TanStack Query caches so components re-fetch without manual polling.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const CEREMONY_EVENTS = [
  'signer.ceremony.created',
  'signer.ceremony.started',
  'signer.ceremony.chain_confirmed',
  'signer.ceremony.completed',
  'signer.ceremony.failed',
  'signer.ceremony.cancelled',
] as const;

/** Subscribes to signer ceremony socket events and invalidates query cache on each event. */
export function useSignersSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const invalidate = (data?: { ceremonyId?: string }) => {
      void qc.invalidateQueries({ queryKey: ['ceremonies'] });
      if (data?.ceremonyId) {
        void qc.invalidateQueries({ queryKey: ['ceremony', data.ceremonyId] });
      }
    };

    for (const event of CEREMONY_EVENTS) {
      socket.on(event, invalidate);
    }

    return () => {
      const s = getSocket();
      for (const event of CEREMONY_EVENTS) {
        s.off(event, invalidate);
      }
      disconnectSocket();
    };
  }, [qc]);
}
