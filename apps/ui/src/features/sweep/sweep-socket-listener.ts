import { connectSocket, disconnectSocket } from '@/api/socket';
import { useQueryClient } from '@tanstack/react-query';
// Socket.io listener for sweep.* events — invalidates TanStack Query caches
// so the sweep page updates live without polling.
//
// Events consumed:
//   sweep.started   — new sweep job enqueued
//   sweep.broadcast — tx submitted to network
//   sweep.confirmed — tx confirmed on-chain, deposits marked swept
import { useEffect } from 'react';
import { SWEEP_CANDIDATES_QUERY_KEY } from './use-sweep-candidates';

/** Mount this hook once on the SweepPage to receive live sweep state updates. */
export function useSweepSocketListener() {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const invalidateSweeps = () => {
      void qc.invalidateQueries({ queryKey: ['sweeps'] });
      void qc.invalidateQueries({ queryKey: SWEEP_CANDIDATES_QUERY_KEY() });
    };

    const invalidateAll = () => {
      invalidateSweeps();
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['deposits'] });
    };

    socket.on('sweep.started', invalidateSweeps);
    socket.on('sweep.broadcast', invalidateSweeps);
    socket.on('sweep.confirmed', invalidateAll);
    // Legacy event name used by older fixture code
    socket.on('sweep.completed', invalidateAll);

    return () => {
      socket.off('sweep.started', invalidateSweeps);
      socket.off('sweep.broadcast', invalidateSweeps);
      socket.off('sweep.confirmed', invalidateAll);
      socket.off('sweep.completed', invalidateAll);
      disconnectSocket();
    };
  }, [qc]);
}
