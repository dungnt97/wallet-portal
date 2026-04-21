// KYC tier update service — update user kyc_tier and emit audit with before/after diff.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface UpdateKycInput {
  userId: string;
  kycTier: 'none' | 'basic' | 'enhanced';
  staffId: string;
  ipAddr?: string;
}

export interface UpdateKycResult {
  user: typeof schema.users.$inferSelect;
}

/**
 * Update user KYC tier and emit audit entry with before/after diff.
 * Throws NotFoundError if user does not exist.
 * Throws ValidationError if tier is unchanged (no-op detected).
 */
export async function updateUserKyc(db: Db, input: UpdateKycInput): Promise<UpdateKycResult> {
  const { userId, kycTier, staffId, ipAddr } = input;

  // Fetch current state
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!existing) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  const prevTier = existing.kycTier;
  if (prevTier === kycTier) {
    throw new ValidationError(`KYC tier already set to '${kycTier}' — no change`);
  }

  // Update row
  const rows = await db
    .update(schema.users)
    .set({ kycTier, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  const updated = rows[0];
  if (!updated) throw new Error('UPDATE users returned no rows');

  // Audit — no PII in changes (tier values only)
  await emitAudit(db, {
    staffId,
    action: 'user.kyc_updated',
    resourceType: 'user',
    resourceId: userId,
    changes: { before: { kycTier: prevTier }, after: { kycTier } },
    ...(ipAddr !== undefined && { ipAddr }),
  });

  return { user: updated };
}
