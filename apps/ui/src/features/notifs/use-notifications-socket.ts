import { connectSocket, disconnectSocket, getSocket } from '@/api/socket';
import { useAuth } from '@/auth/use-auth';
import { useToast } from '@/components/overlays/toast-host';
import { useQueryClient } from '@tanstack/react-query';
// Socket.io integration for live notification push.
// Joins the staff-private room on mount, listens for notif.created,
// invalidates TanStack Query caches, and toasts on critical severity.
//
// Mount once in AppLayout so the socket is live for the entire session.
import type { NotificationPayload } from '@wp/shared-types';
import { useEffect } from 'react';
import { notifKeys } from './use-notifications';

/**
 * Connects the Socket.io client with the current staff's id so the server
 * can route `notif.created` to the correct room (`staff:{id}`).
 *
 * Must be rendered inside <ToastHost> and <AuthProvider>.
 */
export function useNotificationsSocket(): void {
  const { staff } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!staff) return;

    // Connect (or increment ref-count) with staffId in handshake query
    // so the server joins the client to room `staff:{id}` on connect.
    // getSocket() must be called before connectSocket() to set query param
    // only once — subsequent connect() calls reuse the same socket instance.
    const socket = getSocket();
    // Attach staffId so the server joins this client to room `staff:{id}`.
    // socket.io.opts.query is typed as object|string|undefined — cast via unknown.
    const currentQuery = socket.io.opts.query as Record<string, string> | undefined;
    if (!currentQuery?.staffId) {
      socket.io.opts.query = { staffId: staff.id } as Record<string, string>;
    }

    connectSocket();

    const handleNotifCreated = (notif: NotificationPayload) => {
      // Invalidate both list and count so bell badge + panel update reactively
      void qc.invalidateQueries({ queryKey: notifKeys.all });

      // Toast for critical severity so operators notice even when panel is closed
      if (notif.severity === 'critical') {
        toast(`CRITICAL: ${notif.title}`, 'error');
      }
    };

    socket.on('notif.created', handleNotifCreated);

    return () => {
      socket.off('notif.created', handleNotifCreated);
      disconnectSocket();
    };
  }, [staff, qc, toast]);
}
