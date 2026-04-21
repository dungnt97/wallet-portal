// use-sidebar-counts — polls /dashboard/nav-counts every 30s for live sidebar badge values.
// Refreshed on relevant Socket.io events (deposit.credited, withdrawal.created, etc.).
import { useNavCounts } from '@/api/queries';
import { connectSocket, disconnectSocket } from '@/api/socket';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export interface SidebarCounts {
  deposits: number | null;
  sweep: number | null;
  withdrawals: number | null;
  multisig: number | null;
  recovery: number | null;
}

// Events that should trigger a badge refresh
const BADGE_REFRESH_EVENTS = [
  'deposit.credited',
  'deposit.created',
  'withdrawal.created',
  'withdrawal.approved',
  'withdrawal.cancelled',
  'withdrawal.rejected',
  'sweep.created',
  'sweep.confirmed',
  'rebalance.created',
  'multisig.approved',
  'multisig.rejected',
] as const;

/** Returns live nav badge counts. Null values mean data is still loading. */
export function useSidebarCounts(): SidebarCounts {
  const { data } = useNavCounts();
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['dashboard', 'nav-counts'] });
    };

    for (const evt of BADGE_REFRESH_EVENTS) {
      socket.on(evt, invalidate);
    }

    return () => {
      for (const evt of BADGE_REFRESH_EVENTS) {
        socket.off(evt, invalidate);
      }
      disconnectSocket();
    };
  }, [qc]);

  if (!data) {
    return { deposits: null, sweep: null, withdrawals: null, multisig: null, recovery: null };
  }

  return {
    deposits: data.deposits,
    sweep: data.sweep,
    withdrawals: data.withdrawals,
    multisig: data.multisig,
    recovery: data.recovery,
  };
}
