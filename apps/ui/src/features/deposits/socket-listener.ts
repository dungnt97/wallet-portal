// Socket.io listener — subscribes to 'deposit.credited' events and invalidates TanStack Query cache
// Mount once at app level or within DepositsPage — unmounts cleanly on component teardown
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../../api/socket';
import { DEPOSITS_QUERY_KEY } from './use-deposits';

/**
 * Hook: subscribes to deposit.credited Socket.io events.
 * On event: invalidates all deposits queries → triggers refetch → UI updates.
 * Also invalidates dashboard stats so KPI card count refreshes.
 */
export function useDepositSocketListener(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const handleDepositCredited = () => {
      // Invalidate all deposits queries (any pagination/filter combo)
      void queryClient.invalidateQueries({ queryKey: [DEPOSITS_QUERY_KEY] });
      // Also refresh dashboard metrics (pending deposits count changed)
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    socket.on('deposit.credited', handleDepositCredited);

    return () => {
      socket.off('deposit.credited', handleDepositCredited);
      disconnectSocket();
    };
  }, [queryClient]);
}
