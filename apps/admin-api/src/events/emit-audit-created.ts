// Socket.io emitter — broadcasts audit.created event to /stream namespace
// Call after emitAudit() INSERT completes (outside the transaction) so the row is visible.
import type { Server as SocketIOServer } from 'socket.io';

export interface AuditCreatedPayload {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  staffId: string | null;
  createdAt: string;
}

/**
 * Emit 'audit.created' on the /stream namespace.
 * UI clients invalidate their TanStack Query ['audit'] cache on receipt.
 * Payload contains only non-sensitive metadata — no changes JSONB.
 */
export function emitAuditCreated(io: SocketIOServer, payload: AuditCreatedPayload): void {
  io.of('/stream').emit('audit.created', payload);
}
