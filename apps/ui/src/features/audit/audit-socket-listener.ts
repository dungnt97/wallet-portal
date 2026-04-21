import { useQueryClient } from '@tanstack/react-query';
// Socket.io listener — subscribes to 'audit.created' events and invalidates TanStack Query cache
// Mount once within AuditPage — unmounts cleanly on component teardown
import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../../api/socket';
import { AUDIT_QUERY_KEY } from './use-audit-logs';

/**
 * Hook: subscribes to audit.created Socket.io events.
 * On event: invalidates all audit queries → triggers refetch → table updates live.
 */
export function useAuditSocketListener(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const handleAuditCreated = () => {
      void queryClient.invalidateQueries({ queryKey: [AUDIT_QUERY_KEY] });
    };

    socket.on('audit.created', handleAuditCreated);

    return () => {
      socket.off('audit.created', handleAuditCreated);
      disconnectSocket();
    };
  }, [queryClient]);
}
