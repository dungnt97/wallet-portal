// Kill-switch service — reads + toggles the system_kill_switch singleton row.
// Used by: kill-switch route, withdrawal-create, sweep-create.
import { eq } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';

// ── Error types ───────────────────────────────────────────────────────────────

/** Thrown by createWithdrawal / createSweeps when kill-switch is active */
export class KillSwitchEnabledError extends Error {
  readonly statusCode = 423;
  readonly code = 'KILL_SWITCH_ENABLED';

  constructor(reason: string | null) {
    super(reason ? `System paused: ${reason}` : 'System kill-switch is enabled — outbound paused');
    this.name = 'KillSwitchEnabledError';
  }
}

// ── State type ────────────────────────────────────────────────────────────────

export interface KillSwitchState {
  enabled: boolean;
  reason: string | null;
  updatedByStaffId: string | null;
  updatedAt: string;
}

// ── getState ──────────────────────────────────────────────────────────────────

/**
 * Return the current kill-switch state.
 * Inserts the singleton row if (somehow) it is missing — safe to call at any time.
 */
export async function getState(db: Db): Promise<KillSwitchState> {
  const row = await db.query.systemKillSwitch.findFirst({
    where: eq(schema.systemKillSwitch.id, 1),
  });

  if (!row) {
    // Row should always exist (seeded in migration) — defensive insert.
    const [inserted] = await db
      .insert(schema.systemKillSwitch)
      .values({ id: 1, enabled: false })
      .onConflictDoNothing()
      .returning();

    const r = inserted ?? {
      enabled: false,
      reason: null,
      updatedByStaffId: null,
      updatedAt: new Date(),
    };
    return {
      enabled: r.enabled,
      reason: r.reason ?? null,
      updatedByStaffId: r.updatedByStaffId ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  return {
    enabled: row.enabled,
    reason: row.reason ?? null,
    updatedByStaffId: row.updatedByStaffId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── toggle ────────────────────────────────────────────────────────────────────

export interface ToggleInput {
  enabled: boolean;
  reason?: string | undefined;
  staffId: string;
}

/**
 * Toggle the kill-switch flag. Writes audit log entry and emits Socket.io event.
 * Returns the new state.
 */
export async function toggle(
  db: Db,
  input: ToggleInput,
  io: SocketIOServer
): Promise<KillSwitchState> {
  const { enabled, reason, staffId } = input;

  const [updated] = await db
    .update(schema.systemKillSwitch)
    .set({
      enabled,
      reason: reason ?? null,
      updatedByStaffId: staffId,
      updatedAt: new Date(),
    })
    .where(eq(schema.systemKillSwitch.id, 1))
    .returning();

  if (!updated) {
    throw new Error('system_kill_switch row not found — run migration 0010');
  }

  // Write audit entry
  await emitAudit(db, {
    staffId,
    action: enabled ? 'killswitch.enabled' : 'killswitch.disabled',
    resourceType: 'system',
    resourceId: 'kill_switch',
    changes: { enabled, reason: reason ?? null },
  });

  // Notify all connected clients
  io.of('/stream').emit('ops.killswitch.changed', {
    enabled: updated.enabled,
    reason: updated.reason ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  });

  return {
    enabled: updated.enabled,
    reason: updated.reason ?? null,
    updatedByStaffId: updated.updatedByStaffId ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
