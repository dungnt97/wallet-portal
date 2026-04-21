// Login history service — records every auth attempt (success or failure) to
// staff_login_history. Fire-and-forget: failures are logged but never thrown.
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface RecordLoginParams {
  /** staff_id — null when the staff member was not found during lookup */
  staffId: string | null;
  success: boolean;
  /** Client IP address (from x-forwarded-for or socket.remoteAddress) */
  ip: string | null;
  /** Raw User-Agent header */
  ua: string | null;
  /** Machine-readable failure code (e.g. 'TOKEN_INVALID', 'DOMAIN_NOT_ALLOWED') */
  failureReason?: string | null;
}

/**
 * Insert one row into staff_login_history.
 * Non-blocking: errors are logged but never thrown — a broken history table
 * must never prevent a successful login from completing.
 */
export async function recordLogin(
  db: Db,
  params: RecordLoginParams,
  log?: FastifyBaseLogger
): Promise<void> {
  try {
    await db.insert(schema.staffLoginHistory).values({
      staffId: params.staffId ?? undefined,
      success: params.success,
      ipAddress: params.ip,
      userAgent: params.ua,
      failureReason: params.failureReason ?? null,
    });
  } catch (err) {
    // Log but swallow — history is informational, never business-critical.
    log?.error({ err }, 'Failed to record login history');
  }
}
