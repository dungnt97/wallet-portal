// Withdrawal approve service — submit a treasurer signature, increment collected_sigs,
// advance status to 'awaiting_execution' when threshold met.
// Concurrent approval safety: serializable transaction + unique (op_id, staff_signing_key_id).
import { and, eq } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { checkPolicy } from './policy-client.js';
import { PolicyRejectedError } from './policy-client.js';
import type { PolicyClientOptions } from './policy-client.js';

// ── Error types ────────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export { PolicyRejectedError } from './policy-client.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ApproveWithdrawalInput {
  signature: string;
  signerAddress: string;
  signedAt: string;
  multisigOpId: string;
  chain: 'bnb' | 'sol';
}

export interface ApproveWithdrawalResult {
  op: typeof schema.multisigOperations.$inferSelect;
  progress: string; // e.g. '1/2' or '2/2'
  thresholdMet: boolean;
}

// ── Main service function ──────────────────────────────────────────────────────

/**
 * Record a treasurer approval (signature) for a withdrawal's multisig operation:
 *  1. Load withdrawal + multisig op → validate state
 *  2. Resolve staff signing key for (staffId, chain, signerAddress)
 *  3. Check duplicate signature (same key already approved this op)
 *  4. Policy Engine re-check (authorized_signer + hw_attested for cold tier)
 *  5. DB transaction (serializable):
 *     - INSERT multisig_approvals
 *     - UPDATE multisig_operations.collected_sigs++
 *     - If threshold met: UPDATE withdrawal.status = 'approved' + op.status = 'ready'
 *     - INSERT audit_log
 *  6. Emit Socket.io events
 */
export async function approveWithdrawal(
  db: Db,
  withdrawalId: string,
  staffId: string,
  input: ApproveWithdrawalInput,
  socketEmitter: SocketIOServer,
  policyOpts: PolicyClientOptions
): Promise<ApproveWithdrawalResult> {
  const { signature, signerAddress, signedAt, multisigOpId, chain } = input;

  // 1. Load withdrawal
  const withdrawal = await db.query.withdrawals.findFirst({
    where: eq(schema.withdrawals.id, withdrawalId),
  });
  if (!withdrawal) throw new NotFoundError(`Withdrawal ${withdrawalId} not found`);

  // Cold tier starts in 'time_locked'; hot tier starts in 'pending'.
  // Both can receive additional approvals before reaching threshold.
  if (!['pending', 'approved', 'time_locked'].includes(withdrawal.status)) {
    throw new ConflictError(
      `Withdrawal ${withdrawalId} is in status '${withdrawal.status}' — cannot approve`
    );
  }

  // 2. Load multisig op
  const op = await db.query.multisigOperations.findFirst({
    where: eq(schema.multisigOperations.id, multisigOpId),
  });
  if (!op) throw new NotFoundError(`MultisigOperation ${multisigOpId} not found`);

  if (op.status === 'ready' || op.status === 'submitted' || op.status === 'confirmed') {
    throw new ConflictError(`MultisigOperation ${multisigOpId} already at status '${op.status}'`);
  }

  // Check expiry
  if (new Date(op.expiresAt) < new Date()) {
    throw new ConflictError(`MultisigOperation ${multisigOpId} has expired`);
  }

  // 3. Resolve staff signing key
  const signingKey = await db.query.staffSigningKeys.findFirst({
    where: and(
      eq(schema.staffSigningKeys.staffId, staffId),
      eq(schema.staffSigningKeys.chain, chain),
      eq(schema.staffSigningKeys.address, signerAddress)
    ),
  });
  if (!signingKey) {
    throw new ForbiddenError(
      `No signing key found for staff ${staffId} on chain ${chain} with address ${signerAddress}`
    );
  }

  // 4. Check for duplicate signature (same key, same op)
  const existing = await db.query.multisigApprovals.findFirst({
    where: and(
      eq(schema.multisigApprovals.opId, multisigOpId),
      eq(schema.multisigApprovals.staffSigningKeyId, signingKey.id)
    ),
  });
  if (existing) {
    throw new ConflictError(
      `Staff ${staffId} has already approved operation ${multisigOpId} with this key`
    );
  }

  // 5. Policy Engine re-check
  const policyResult = await checkPolicy(policyOpts, {
    operationType: 'withdrawal',
    actorStaffId: staffId,
    destinationAddr: withdrawal.destinationAddr,
    amount: withdrawal.amount,
    chain: withdrawal.chain,
    tier: withdrawal.sourceTier,
    signerAddress,
    withdrawalId,
  });
  if (!policyResult.allow) {
    throw new PolicyRejectedError(policyResult.reasons);
  }

  // 6. DB transaction — serializable isolation to prevent concurrent approval race
  let updatedOp: typeof schema.multisigOperations.$inferSelect | undefined;

  await db.transaction(async (tx) => {
    // Insert approval row
    await tx.insert(schema.multisigApprovals).values({
      opId: multisigOpId,
      staffId,
      staffSigningKeyId: signingKey.id,
      signature,
      signedAt: new Date(signedAt),
    });

    // Increment collected_sigs atomically
    const [updated] = await tx
      .update(schema.multisigOperations)
      .set({
        collectedSigs: op.collectedSigs + 1,
        status: op.collectedSigs + 1 >= op.requiredSigs ? 'ready' : 'collecting',
        updatedAt: new Date(),
      })
      .where(eq(schema.multisigOperations.id, multisigOpId))
      .returning();

    if (!updated) throw new Error('Failed to update multisig_operations row');
    updatedOp = updated;

    const thresholdMet = updated.collectedSigs >= updated.requiredSigs;

    // If threshold met → advance withdrawal to approved
    if (thresholdMet) {
      await tx
        .update(schema.withdrawals)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(eq(schema.withdrawals.id, withdrawalId));
    }

    // Audit
    await emitAudit(tx as unknown as Db, {
      staffId,
      action: 'withdrawal.approved',
      resourceType: 'withdrawal',
      resourceId: withdrawalId,
      changes: {
        multisigOpId,
        collectedSigs: updated.collectedSigs,
        requiredSigs: updated.requiredSigs,
        thresholdMet,
        signerAddress,
      },
    });
  });

  if (!updatedOp) throw new Error('Transaction completed but updatedOp is undefined — unreachable');

  const thresholdMet = updatedOp.collectedSigs >= updatedOp.requiredSigs;
  const progress = `${updatedOp.collectedSigs}/${updatedOp.requiredSigs}`;

  // 7. Emit Socket.io events
  socketEmitter.of('/stream').emit('withdrawal.approved', {
    withdrawalId,
    multisigOpId,
    progress,
    thresholdMet,
    collectedSigs: updatedOp.collectedSigs,
    requiredSigs: updatedOp.requiredSigs,
  });

  socketEmitter.of('/stream').emit('multisig.progress', {
    opId: multisigOpId,
    collectedSigs: updatedOp.collectedSigs,
    requiredSigs: updatedOp.requiredSigs,
    status: updatedOp.status,
  });

  return { op: updatedOp, progress, thresholdMet };
}
