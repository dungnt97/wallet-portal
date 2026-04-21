import type { Queue } from 'bullmq';
// Withdrawal execute service — validates pre-conditions, enqueues BullMQ job.
// Also handles internal callbacks: broadcasted + confirmed (called by wallet-engine).
import { eq } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { recordWithdrawalBroadcast } from './ledger.service.js';

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

// ── BullMQ job type (shared with wallet-engine) ────────────────────────────────

export interface WithdrawalExecuteJobData {
  withdrawalId: string;
  multisigOpId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  destinationAddr: string;
  sourceTier: 'hot' | 'cold';
}

export const WITHDRAWAL_EXECUTE_QUEUE = 'withdrawal_execute';

// ── Execute (enqueue) ─────────────────────────────────────────────────────────

/**
 * Validate pre-conditions and enqueue the withdrawal_execute BullMQ job.
 * Pre-conditions:
 *  - withdrawal.status must be 'approved' (threshold met)
 *  - time_lock_expires_at must be null or in the past
 */
export async function executeWithdrawal(
  db: Db,
  withdrawalId: string,
  staffId: string,
  queue: Queue<WithdrawalExecuteJobData>,
  socketEmitter: SocketIOServer
): Promise<{ jobId: string }> {
  const withdrawal = await db.query.withdrawals.findFirst({
    where: eq(schema.withdrawals.id, withdrawalId),
  });
  if (!withdrawal) throw new NotFoundError(`Withdrawal ${withdrawalId} not found`);

  // Cold tier: accept 'time_locked' OR 'approved'; timelock must have expired.
  // Hot tier: only 'approved' is valid (no timelock transition to time_locked).
  const executableStatuses = ['approved', 'time_locked'];
  if (!executableStatuses.includes(withdrawal.status)) {
    throw new ConflictError(
      `Withdrawal ${withdrawalId} status is '${withdrawal.status}' — must be 'approved' or 'time_locked' to execute`
    );
  }

  // Time-lock guard — rejects if timelock has not yet expired
  if (withdrawal.timeLockExpiresAt && new Date(withdrawal.timeLockExpiresAt) > new Date()) {
    throw new ConflictError(
      `Withdrawal ${withdrawalId} time-lock active until ${withdrawal.timeLockExpiresAt.toISOString()}`
    );
  }

  if (!withdrawal.multisigOpId) {
    throw new ConflictError(`Withdrawal ${withdrawalId} has no associated multisig operation`);
  }

  // Mark as executing
  await db
    .update(schema.withdrawals)
    .set({ status: 'executing', updatedAt: new Date() })
    .where(eq(schema.withdrawals.id, withdrawalId));

  // Audit
  await emitAudit(db, {
    staffId,
    action: 'withdrawal.executing',
    resourceType: 'withdrawal',
    resourceId: withdrawalId,
    changes: { status: { from: 'approved', to: 'executing' } },
  });

  // Enqueue BullMQ job (idempotent job ID)
  const job = await queue.add(
    WITHDRAWAL_EXECUTE_QUEUE,
    {
      withdrawalId,
      multisigOpId: withdrawal.multisigOpId,
      chain: withdrawal.chain,
      token: withdrawal.token,
      amount: withdrawal.amount,
      destinationAddr: withdrawal.destinationAddr,
      sourceTier: withdrawal.sourceTier,
    },
    { jobId: `withdrawal_execute:${withdrawalId}` }
  );

  socketEmitter.of('/stream').emit('withdrawal.executing', {
    withdrawalId,
    status: 'executing',
  });

  return { jobId: job.id ?? `withdrawal_execute:${withdrawalId}` };
}

// ── Broadcasted callback (called by wallet-engine via /internal) ───────────────

export interface BroadcastedCallbackInput {
  txHash: string;
  /** On-chain nonce — required for EVM bump/cancel in Slice 11 */
  nonce?: number | null;
}

export async function recordBroadcasted(
  db: Db,
  withdrawalId: string,
  input: BroadcastedCallbackInput,
  socketEmitter: SocketIOServer
): Promise<void> {
  const withdrawal = await db.query.withdrawals.findFirst({
    where: eq(schema.withdrawals.id, withdrawalId),
  });
  if (!withdrawal) throw new NotFoundError(`Withdrawal ${withdrawalId} not found`);

  const broadcastAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(schema.withdrawals)
      .set({
        status: 'broadcast',
        txHash: input.txHash,
        broadcastAt,
        // Persist nonce when wallet-engine provides it (required for EVM bump/cancel).
        // null is acceptable — recovery service will reject bump/cancel when nonce is absent.
        ...(input.nonce != null ? { nonce: input.nonce } : {}),
        updatedAt: broadcastAt,
      })
      .where(eq(schema.withdrawals.id, withdrawalId));

    // Ledger: debit hot_wallet, credit destination virtual account
    await recordWithdrawalBroadcast(tx as unknown as Db, {
      txHash: input.txHash,
      withdrawalId,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      currency: withdrawal.token,
      chain: withdrawal.chain,
    });

    await emitAudit(tx as unknown as Db, {
      staffId: null,
      action: 'withdrawal.broadcast',
      resourceType: 'withdrawal',
      resourceId: withdrawalId,
      changes: {
        status: { from: 'executing', to: 'broadcast' },
        txHash: input.txHash,
        ...(input.nonce != null ? { nonce: input.nonce } : {}),
      },
    });
  });

  socketEmitter.of('/stream').emit('withdrawal.broadcast', {
    withdrawalId,
    txHash: input.txHash,
    status: 'broadcast',
  });
}

// ── Confirmed callback (called by wallet-engine via /internal) ─────────────────

export async function recordConfirmed(
  db: Db,
  withdrawalId: string,
  socketEmitter: SocketIOServer
): Promise<void> {
  const withdrawal = await db.query.withdrawals.findFirst({
    where: eq(schema.withdrawals.id, withdrawalId),
  });
  if (!withdrawal) throw new NotFoundError(`Withdrawal ${withdrawalId} not found`);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.withdrawals)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(schema.withdrawals.id, withdrawalId));

    await emitAudit(tx as unknown as Db, {
      staffId: null,
      action: 'withdrawal.confirmed',
      resourceType: 'withdrawal',
      resourceId: withdrawalId,
      changes: { status: { from: 'executing', to: 'completed' } },
    });
  });

  socketEmitter.of('/stream').emit('withdrawal.confirmed', {
    withdrawalId,
    status: 'completed',
  });
}
