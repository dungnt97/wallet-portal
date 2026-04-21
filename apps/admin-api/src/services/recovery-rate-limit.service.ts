// Recovery rate-limit service — enforces max bumps per tx within a rolling window.
// Uses a SQL count on recovery_actions to avoid Redis dependency.
//
// Rate limit rule: max RECOVERY_MAX_BUMPS bump actions per (entityType, entityId)
// within a 1-hour rolling window. Returns the count of recent bumps.
import { and, count, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface RateLimitCheck {
  /** Number of bump actions in the last hour */
  recentBumpCount: number;
  /** Whether the limit has been reached */
  exceeded: boolean;
  /** Max allowed bumps (from env) */
  maxBumps: number;
}

/**
 * Count recent bump actions for a given entity within the last hour.
 * Returns exceeded=true if bump_count >= maxBumps.
 */
export async function checkBumpRateLimit(
  db: Db,
  entityType: 'withdrawal' | 'sweep',
  entityId: string
): Promise<RateLimitCheck> {
  const maxBumps = Number(process.env.RECOVERY_MAX_BUMPS ?? '3');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000);

  const [row] = await db
    .select({ cnt: count() })
    .from(schema.recoveryActions)
    .where(
      and(
        eq(schema.recoveryActions.entityType, entityType),
        eq(schema.recoveryActions.entityId, entityId),
        eq(schema.recoveryActions.actionType, 'bump'),
        gt(schema.recoveryActions.createdAt, oneHourAgo)
      )
    );

  const recentBumpCount = Number(row?.cnt ?? 0);
  return {
    recentBumpCount,
    exceeded: recentBumpCount >= maxBumps,
    maxBumps,
  };
}

/**
 * Check idempotency: return existing recovery_action if the idempotency_key
 * was used within the last 24 hours, else null.
 */
export async function findByIdempotencyKey(
  db: Db,
  idempotencyKey: string
): Promise<typeof schema.recoveryActions.$inferSelect | null> {
  const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);

  const row = await db.query.recoveryActions.findFirst({
    where: and(
      eq(schema.recoveryActions.idempotencyKey, idempotencyKey),
      gt(schema.recoveryActions.createdAt, ttlCutoff)
    ),
  });

  return row ?? null;
}
