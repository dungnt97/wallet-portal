// deposit-manual-credit.service — admin-override credit bypass.
// Creates a deposit row with manual=true + double-entry ledger entry.
// Requires admin role + WebAuthn step-up (enforced at route level).
// Emits critical audit entry + notifyStaff to all admins.
import type { Queue } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { recordCredit } from './ledger.service.js';
import type { EmailJobData, SlackJobData } from './notify-staff.service.js';
import { notifyStaff } from './notify-staff.service.js';

export interface ManualCreditParams {
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  /** Decimal string, e.g. "1000.00" */
  amount: string;
  /** Admin's justification — min 20 chars */
  reason: string;
  /** UUID of the admin staff member performing the credit */
  staffId: string;
}

export interface ManualCreditResult {
  depositId: string;
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  creditedBy: string;
  createdAt: string;
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Apply a manual credit override for a user:
 *  1. Validate inputs
 *  2. Verify user exists
 *  3. Insert deposit row (manual=true, status=credited)
 *  4. Double-entry ledger: debit manual_adjustment, credit user:<id>
 *  5. Critical audit entry
 *  6. Fan-out notification to all admins
 */
export async function manualCredit(
  db: Db,
  io: SocketIOServer,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>,
  params: ManualCreditParams
): Promise<ManualCreditResult> {
  const { userId, chain, token, amount, reason, staffId } = params;

  // Input validation
  const amountNum = Number.parseFloat(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ValidationError('amount must be a positive decimal string');
  }
  if (!reason || reason.trim().length < 20) {
    throw new ValidationError('reason must be at least 20 characters');
  }

  // Verify user exists
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { id: true },
  });
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  // Synthetic tx hash — unique, traceable as manual override
  const txHash = `manual:${staffId.slice(0, 8)}:${Date.now()}`;
  const now = new Date();

  let depositId = '';

  await db.transaction(async (tx) => {
    // Insert deposit row: manual=true, status='credited' immediately
    const [inserted] = await tx
      .insert(schema.deposits)
      .values({
        userId,
        chain,
        token,
        amount,
        status: 'credited',
        confirmedBlocks: 0,
        txHash,
        manual: true,
        reason: reason.trim(),
        creditedBy: staffId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.deposits.id });

    if (!inserted) throw new Error('Failed to insert manual deposit row');
    depositId = inserted.id;

    // Double-entry ledger: debit manual_adjustment account, credit user
    await recordCredit(tx as unknown as Db, {
      txHash,
      userId,
      amount,
      currency: token,
      chain,
    });

    // Critical audit entry (inside transaction for atomicity)
    await emitAudit(tx as unknown as Db, {
      staffId,
      action: 'deposit.manual_credit',
      resourceType: 'deposit',
      resourceId: depositId,
      changes: {
        userId,
        chain,
        token,
        amount,
        reason: reason.trim(),
        txHash,
      },
    });
  });

  // Fan-out notification to all admins (outside transaction — non-fatal)
  await notifyStaff(
    db,
    io,
    {
      role: 'admin',
      eventType: 'deposit.manual_credit',
      severity: 'critical',
      title: `Manual credit applied: ${amount} ${token}`,
      body: `Admin override credit for user ${userId}. Reason: ${reason.trim()}`,
      payload: { depositId, userId, chain, token, amount, staffId },
    },
    emailQueue,
    slackQueue
  ).catch((err) => {
    // Non-fatal: log notification failure but don't roll back credit
    console.error('[manual-credit] notification fanout failed: %s', err);
  });

  return {
    depositId,
    userId,
    chain,
    token,
    amount,
    creditedBy: staffId,
    createdAt: now.toISOString(),
  };
}
