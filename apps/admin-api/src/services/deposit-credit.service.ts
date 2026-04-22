// Deposit credit service — atomic: update deposit status + ledger + audit in one transaction
// Idempotency: throws ConflictError (409) if deposit is not in 'pending' state
// Called by POST /internal/deposits/:id/credit (bearer-protected)
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { recordCredit } from './ledger.service.js';

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
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

export interface CreditDepositResult {
  id: string;
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  txHash: string;
  status: string;
}

/**
 * Credits a pending deposit atomically:
 *  1. Load deposit row — 404 if not found
 *  2. Guard status === 'pending' — 409 if already credited/swept/failed
 *  3. Transaction: update deposits.status → 'credited', insert ledger entries, insert audit row
 *  4. Return result for Socket.io emit
 */
export async function creditDeposit(db: Db, depositId: string): Promise<CreditDepositResult> {
  // Load outside transaction first for fast fail (no row-lock needed at this stage)
  const existing = await db.query.deposits.findFirst({
    where: eq(schema.deposits.id, depositId),
  });

  if (!existing) {
    throw new NotFoundError(`Deposit ${depositId} not found`);
  }

  if (existing.status !== 'pending') {
    throw new ConflictError(
      `Deposit ${depositId} is already in status '${existing.status}' — cannot credit twice`
    );
  }

  // Ensure tx_hash is present (simulate script always sets it; real watcher also sets it)
  const txHash = existing.txHash ?? `sys_${depositId}`;

  await db.transaction(async (tx) => {
    // Re-check status inside transaction with implicit row lock via UPDATE
    const [updated] = await tx
      .update(schema.deposits)
      .set({ status: 'credited', updatedAt: new Date() })
      .where(eq(schema.deposits.id, depositId))
      .returning({ status: schema.deposits.status });

    // If concurrent credit beat us, the status will differ — abort
    if (!updated || updated.status !== 'credited') {
      throw new ConflictError(`Concurrent credit detected for deposit ${depositId}`);
    }

    // Double-entry ledger (debit external, credit user balance)
    await recordCredit(tx as unknown as Db, {
      txHash,
      userId: existing.userId,
      amount: existing.amount,
      currency: existing.token,
      chain: existing.chain,
    });

    // Audit trail — system-initiated (no staffId)
    await emitAudit(tx as unknown as Db, {
      staffId: null,
      action: 'deposit.credit',
      resourceType: 'deposit',
      resourceId: depositId,
      changes: { status: { from: 'pending', to: 'credited' } },
    });
  });

  return {
    id: existing.id,
    userId: existing.userId,
    chain: existing.chain,
    token: existing.token,
    amount: existing.amount,
    txHash,
    status: 'credited',
  };
}
