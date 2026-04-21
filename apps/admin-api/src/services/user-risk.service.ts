// user-risk.service — manual risk tier update with audit + ops notification
// Called by PATCH /users/:id/risk (admin + WebAuthn step-up)
// Policy engine reads users.risk_tier for daily_limit multiplier.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { RiskTier } from '../db/schema/users.js';
import { emitAudit } from './audit.service.js';

export interface UpdateRiskTierParams {
  userId: string;
  tier: RiskTier;
  reason: string;
  staffId: string;
}

export interface UpdateRiskTierResult {
  userId: string;
  riskTier: RiskTier;
  riskReason: string;
  riskUpdatedAt: string;
  riskUpdatedBy: string;
}

const VALID_TIERS = new Set<RiskTier>(['low', 'medium', 'high', 'frozen']);

/**
 * Update a user's risk tier. Emits a critical audit entry.
 * frozen → blocks all withdrawals via policy engine (multiplier = 0).
 */
export async function updateRiskTier(
  db: Db,
  params: UpdateRiskTierParams
): Promise<UpdateRiskTierResult> {
  const { userId, tier, reason, staffId } = params;

  if (!VALID_TIERS.has(tier)) {
    throw new Error(`Invalid risk tier: ${tier}. Must be one of: ${[...VALID_TIERS].join(', ')}`);
  }
  if (!reason || reason.trim().length < 5) {
    throw new Error('Risk tier change requires a reason (min 5 characters)');
  }

  const now = new Date();

  const [updated] = await db
    .update(schema.users)
    .set({
      riskTier: tier,
      riskReason: reason.trim(),
      riskUpdatedAt: now,
      riskUpdatedBy: staffId,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId))
    .returning({
      id: schema.users.id,
      riskTier: schema.users.riskTier,
      riskReason: schema.users.riskReason,
      riskUpdatedAt: schema.users.riskUpdatedAt,
      riskUpdatedBy: schema.users.riskUpdatedBy,
    });

  if (!updated) throw new Error(`User ${userId} not found`);

  await emitAudit(db, {
    staffId,
    action: 'user.risk_tier.updated',
    resourceType: 'user',
    resourceId: userId,
    changes: { tier, reason: reason.trim(), previousTier: undefined },
  });

  return {
    userId,
    riskTier: updated.riskTier as RiskTier,
    riskReason: updated.riskReason ?? '',
    riskUpdatedAt: (updated.riskUpdatedAt ?? now).toISOString(),
    riskUpdatedBy: updated.riskUpdatedBy ?? staffId,
  };
}
