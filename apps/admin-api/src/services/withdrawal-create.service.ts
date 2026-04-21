import type { Queue } from 'bullmq';
// Withdrawal create service — atomic: validate → policy-check → DB insert → emit.
// Throws PolicyRejectedError (403), NotFoundError (404), ValidationError (422).
import { eq, sql } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { KillSwitchEnabledError, getState as getKillSwitchState } from './kill-switch.service.js';
import { PolicyRejectedError, checkPolicy } from './policy-client.js';
import type { PolicyClientOptions } from './policy-client.js';

// ── Cold-timelock BullMQ job ──────────────────────────────────────────────────

export const COLD_TIMELOCK_QUEUE = 'cold_timelock_broadcast';

export interface ColdTimelockJobData {
  withdrawalId: string;
}

// ── Error types ───────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export { PolicyRejectedError } from './policy-client.js';
export { KillSwitchEnabledError } from './kill-switch.service.js';

// ── Input / output types ──────────────────────────────────────────────────────

export interface CreateWithdrawalInput {
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  destinationAddr: string;
  sourceTier: 'hot' | 'cold';
}

export interface CreateWithdrawalResult {
  withdrawal: typeof schema.withdrawals.$inferSelect;
  multisigOp: typeof schema.multisigOperations.$inferSelect;
}

// ── Time-lock helpers ─────────────────────────────────────────────────────────

const HOT_LARGE_THRESHOLD = 50_000; // USD equivalent

/** Dev fast-forward: SLICE7_TIMELOCK_FASTFORWARD=true → 5 seconds instead of 48h for cold */
function isFastForward(): boolean {
  return process.env.SLICE7_TIMELOCK_FASTFORWARD === 'true';
}

function computeTimeLockExpiresAt(tier: 'hot' | 'cold', amount: string): Date | null {
  const numeric = Number(amount);
  if (tier === 'cold') {
    const d = new Date();
    if (isFastForward()) {
      d.setSeconds(d.getSeconds() + 5);
    } else {
      d.setHours(d.getHours() + 48);
    }
    return d;
  }
  if (tier === 'hot' && numeric >= HOT_LARGE_THRESHOLD) {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    return d;
  }
  return null; // hot < 50k: no time lock
}

// ── Multisig address per chain ─────────────────────────────────────────────────

function getMultisigAddr(chain: 'bnb' | 'sol'): string {
  if (chain === 'bnb') {
    const addr = process.env.SAFE_ADDRESS;
    if (!addr) {
      throw new Error(
        'FATAL: SAFE_ADDRESS env var not set. ' +
          'Configure the deployed Safe address before creating withdrawals.'
      );
    }
    return addr;
  }
  const addr = process.env.SQUADS_MULTISIG_ADDRESS;
  if (!addr) {
    throw new Error(
      'FATAL: SQUADS_MULTISIG_ADDRESS env var not set. ' +
        'Configure the deployed Squads multisig address before creating withdrawals.'
    );
  }
  return addr;
}

// ── User balance helper ────────────────────────────────────────────────────────

/**
 * Sum ledger credits - debits for a user/currency pair.
 * Returns balance as a string decimal.
 */
async function getUserBalance(db: Db, userId: string, currency: 'USDT' | 'USDC'): Promise<number> {
  const rows = await db
    .select({
      balance: sql<string>`COALESCE(SUM(credit) - SUM(debit), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      sql`${schema.ledgerEntries.account} = ${`user:${userId}`}
        AND ${schema.ledgerEntries.currency} = ${currency}`
    );
  return Number(rows[0]?.balance ?? 0);
}

// ── Main service function ──────────────────────────────────────────────────────

/**
 * Create a withdrawal:
 *  1. Load user → validate KYC (must be basic or enhanced)
 *  2. Check balance ≥ amount
 *  3. Call Policy Engine → throw PolicyRejectedError if blocked
 *  4. DB transaction:
 *     - INSERT withdrawals (status=pending + time_lock_expires_at)
 *     - INSERT multisig_operations (required_sigs=2, expires_at=+24h)
 *     - UPDATE withdrawals.multisig_op_id
 *     - INSERT audit_log
 *  5. Emit Socket.io withdrawal.created
 */
export async function createWithdrawal(
  db: Db,
  input: CreateWithdrawalInput,
  staffId: string,
  socketEmitter: SocketIOServer,
  policyOpts: PolicyClientOptions,
  /** Optional BullMQ queue for cold-timelock delayed broadcast scheduling */
  timelockQueue?: Queue<ColdTimelockJobData>
): Promise<CreateWithdrawalResult> {
  const { userId, chain, token, amount, destinationAddr, sourceTier } = input;

  // 0. Kill-switch guard — short-circuit before any DB writes when system is paused
  const ksState = await getKillSwitchState(db);
  if (ksState.enabled) {
    throw new KillSwitchEnabledError(ksState.reason);
  }

  // 1. Load user
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  // 2. KYC guard — must have at least basic KYC
  if (user.kycTier === 'none') {
    throw new ValidationError(`User ${userId} has not completed KYC (tier: none)`);
  }

  // 3. Balance check
  const balance = await getUserBalance(db, userId, token);
  const amountNum = Number(amount);
  if (balance < amountNum) {
    throw new ValidationError(
      `Insufficient balance: user has ${balance} ${token}, requested ${amount}`
    );
  }

  // 4. Policy Engine pre-check
  const policyResult = await checkPolicy(policyOpts, {
    operationType: 'withdrawal',
    actorStaffId: staffId,
    destinationAddr,
    amount,
    chain,
    tier: sourceTier,
  });
  if (!policyResult.allow) {
    throw new PolicyRejectedError(policyResult.reasons);
  }

  // 5. Compute time lock
  const timeLockExpiresAt = computeTimeLockExpiresAt(sourceTier, amount);

  // 6. DB transaction
  // Initialise to undefined; assigned inside transaction; guard-checked before return.
  let withdrawal: typeof schema.withdrawals.$inferSelect | undefined;
  let multisigOp: typeof schema.multisigOperations.$inferSelect | undefined;

  await db.transaction(async (tx) => {
    // Insert withdrawal row.
    // Cold tier: initial status = 'time_locked' (not 'pending') — auto-broadcast fires after expiry.
    // Hot tier: initial status = 'pending' (existing behaviour).
    const initialStatus = sourceTier === 'cold' && timeLockExpiresAt ? 'time_locked' : 'pending';

    const [newWithdrawal] = await tx
      .insert(schema.withdrawals)
      .values({
        userId,
        chain,
        token,
        amount,
        destinationAddr,
        status: initialStatus,
        sourceTier,
        timeLockExpiresAt: timeLockExpiresAt ?? undefined,
        createdBy: staffId,
      })
      .returning();

    if (!newWithdrawal) throw new Error('Failed to insert withdrawal row');
    withdrawal = newWithdrawal;

    // Insert multisig operation
    const opExpiresAt = new Date();
    opExpiresAt.setHours(opExpiresAt.getHours() + 24);

    const [newOp] = await tx
      .insert(schema.multisigOperations)
      .values({
        withdrawalId: newWithdrawal.id,
        chain,
        operationType: 'withdrawal',
        multisigAddr: getMultisigAddr(chain),
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: opExpiresAt,
        status: 'pending',
      })
      .returning();

    if (!newOp) throw new Error('Failed to insert multisig_operations row');
    multisigOp = newOp;

    // Back-reference: withdrawal → multisig_op
    await tx
      .update(schema.withdrawals)
      .set({ multisigOpId: newOp.id, updatedAt: new Date() })
      .where(eq(schema.withdrawals.id, newWithdrawal.id));

    // Update the local reference too
    withdrawal = { ...newWithdrawal, multisigOpId: newOp.id };

    // Audit log
    await emitAudit(tx as unknown as Db, {
      staffId,
      action: 'withdrawal.created',
      resourceType: 'withdrawal',
      resourceId: newWithdrawal.id,
      changes: {
        status: { from: null, to: initialStatus },
        amount,
        chain,
        token,
        destinationAddr,
        sourceTier,
        multisigOpId: newOp.id,
        timeLockExpiresAt: timeLockExpiresAt?.toISOString() ?? null,
      },
    });
  });

  // Enqueue cold-timelock delayed broadcast job after DB commit.
  // Job fires at timeLockExpiresAt; worker re-checks status + sigs before broadcasting.
  // jobId = withdrawalId ensures idempotency (re-enqueueing same ID is a no-op in BullMQ).
  if (sourceTier === 'cold' && timeLockExpiresAt && timelockQueue && withdrawal) {
    const delayMs = Math.max(0, timeLockExpiresAt.getTime() - Date.now());
    await timelockQueue.add(
      COLD_TIMELOCK_QUEUE,
      { withdrawalId: withdrawal.id },
      {
        jobId: withdrawal.id, // idempotent — same withdrawal can only have one pending job
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      }
    );
  }

  // 7. Emit Socket.io event after commit
  socketEmitter.of('/stream').emit('withdrawal.created', {
    id: withdrawal?.id,
    userId: withdrawal?.userId,
    chain: withdrawal?.chain,
    token: withdrawal?.token,
    amount: withdrawal?.amount,
    destinationAddr: withdrawal?.destinationAddr,
    status: withdrawal?.status,
    sourceTier: withdrawal?.sourceTier,
    multisigOpId: withdrawal?.multisigOpId,
  });

  if (!withdrawal || !multisigOp)
    throw new Error('Transaction completed but rows are undefined — unreachable');
  return { withdrawal, multisigOp };
}
