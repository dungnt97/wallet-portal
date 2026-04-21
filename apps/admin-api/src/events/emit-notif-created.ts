// Socket.io emitter — sends notif.created to the staff-specific room.
// Each staff client joins room `staff:{id}` on connection so only the
// intended recipient receives the event (no cross-staff leak).
import type { Server as SocketIOServer } from 'socket.io';
import type { NotificationRow } from '../db/schema/notifications.js';

export interface NotifCreatedPayload {
  id: string;
  staffId: string;
  eventType: string;
  severity: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Serialize a DB row to the wire payload */
function toPayload(row: NotificationRow): NotifCreatedPayload {
  return {
    id: row.id,
    staffId: row.staffId,
    eventType: row.eventType,
    severity: row.severity,
    title: row.title,
    body: row.body ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    dedupeKey: row.dedupeKey ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Emit `notif.created` to the staff-private room on /stream namespace.
 * Room name: `staff:{staffId}` — joined by the client on connect (see socket.plugin.ts).
 */
export function emitNotifCreated(io: SocketIOServer, row: NotificationRow): void {
  io.of('/stream').to(`staff:${row.staffId}`).emit('notif.created', toPayload(row));
}
