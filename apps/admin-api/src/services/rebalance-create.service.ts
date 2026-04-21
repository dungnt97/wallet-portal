// Rebalance create service — creates a hot→cold withdrawal row (operation_type='hot_to_cold').
// Destination is auto-resolved from wallets WHERE tier='cold' AND chain=? AND purpose='cold_reserve'.
// Reuses withdrawal-create.service.ts internal transaction pattern (DRY via shared helper).
//
// Policy engine whitelist check is bypassed for hot_to_cold destinations by the
// destination_whitelist fast-path rule added in Slice 7 Phase 03.
import { and, eq } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import { KillSwitchEnabledError, getState as getKillSwitchState } from './kill-switch.service.js';
import { PolicyRejectedError, checkPolicy } from './policy-client.js';
import type { PolicyClientOptions } from './policy-client.js';

// ── Re-exports ────────────────────────────────────────────────────────────────

export { KillSwitchEnabledError } from './kill-switch.service.js';
export { PolicyRejectedError } from './policy-client.js';

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

// ── Input / output types ──────────────────────────────────────────────────────

export interface CreateRebalanceInput {
  /** BNB or Solana chain */
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  /** Amount in minor decimal string — same format as withdrawal amounts */
  amountMinor: string;
}

export interface CreateRebalanceResult {
  withdrawal: typeof schema.withdrawals.$inferSelect;
  multisigOp: typeof schema.multisigOperations.$inferSelect;
  destinationAddr: string;
}

// ── Multisig address per chain ────────────────────────────────────────────────

function getMultisigAddr(chain: 'bnb' | 'sol'): string {
  if (chain === 'bnb') {
    return process.env.SAFE_ADDRESS ?? '0x0000000000000000000000000000000000000001';
  }
  return process.env.SQUADS_MULTISIG_ADDRESS ?? '11111111111111111111111111111111';
}

// ── Hot wallet source address resolver ───────────────────────────────────────

async function resolveHotSourceUserId(db: Db): Promise<string> {
  // Rebalances originate from the hot operational wallet.
  // We use a sentinel system user ID for rebalance operations (no end-user involved).
  // Look up the first user in the DB as a fallback for the FK constraint.
  const userRow = await db.query.users.findFirst();
  if (!userRow) {
    throw new ValidationError(
      'No users in DB — cannot satisfy withdrawal.user_id FK for rebalance'
    );
  }
  return userRow.id;
}

// ── Main service function ─────────────────────────────────────────────────────

/**
 * Create a hot→cold rebalance operation:
 *  1. Kill-switch guard
 *  2. Resolve destination cold_reserve wallet for (chain)
 *  3. Policy Engine pre-check — whitelist fast-path allows cold_reserve dest automatically
 *  4. DB transaction: INSERT withdrawals + multisig_operations (operationType='hot_to_cold')
 *  5. Emit Socket.io rebalance.created
 */
export async function createRebalance(
  db: Db,
  input: CreateRebalanceInput,
  staffId: string,
  socketEmitter: SocketIOServer,
  policyOpts: PolicyClientOptions
): Promise<CreateRebalanceResult> {
  const { chain, token, amountMinor } = input;

  // 1. Kill-switch guard
  const ksState = await getKillSwitchState(db);
  if (ksState.enabled) {
    throw new KillSwitchEnabledError(ksState.reason);
  }

  // 2. Resolve cold_reserve destination wallet
  const coldWallet = await db.query.wallets.findFirst({
    where: and(
      eq(schema.wallets.tier, 'cold'),
      eq(schema.wallets.chain, chain),
      eq(schema.wallets.purpose, 'cold_reserve')
    ),
  });
  if (!coldWallet) {
    throw new NotFoundError(
      `No cold_reserve wallet registered for chain=${chain}. Add one via wallets seed.`
    );
  }
  const destinationAddr = coldWallet.address;

  // 3. Resolve a userId for the FK (rebalances have no end-user)
  const userId = await resolveHotSourceUserId(db);

  // 4. Policy Engine pre-check — hot_to_cold operation_type triggers whitelist fast-path
  const policyResult = await checkPolicy(policyOpts, {
    operationType: 'hot_to_cold',
    actorStaffId: staffId,
    destinationAddr,
    amount: amountMinor,
    chain,
    tier: 'hot', // source tier is hot (hot→cold direction)
  });
  if (!policyResult.allow) {
    throw new PolicyRejectedError(policyResult.reasons);
  }

  // 5. DB transaction
  let withdrawal: typeof schema.withdrawals.$inferSelect | undefined;
  let multisigOp: typeof schema.multisigOperations.$inferSelect | undefined;

  await db.transaction(async (tx) => {
    const [newWithdrawal] = await tx
      .insert(schema.withdrawals)
      .values({
        userId,
        chain,
        token,
        amount: amountMinor,
        destinationAddr,
        status: 'pending',
        sourceTier: 'hot',
        createdBy: staffId,
      })
      .returning();

    if (!newWithdrawal) throw new Error('Failed to insert rebalance withdrawal row');
    withdrawal = newWithdrawal;

    const opExpiresAt = new Date();
    opExpiresAt.setHours(opExpiresAt.getHours() + 24);

    const [newOp] = await tx
      .insert(schema.multisigOperations)
      .values({
        withdrawalId: newWithdrawal.id,
        chain,
        // 'hot_to_cold' signals both the policy fast-path and the UI rebalance view
        operationType: 'hot_to_cold',
        multisigAddr: getMultisigAddr(chain),
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: opExpiresAt,
        status: 'pending',
      })
      .returning();

    if (!newOp) throw new Error('Failed to insert rebalance multisig_operations row');
    multisigOp = newOp;

    // Back-reference
    await tx
      .update(schema.withdrawals)
      .set({ multisigOpId: newOp.id, updatedAt: new Date() })
      .where(eq(schema.withdrawals.id, newWithdrawal.id));

    withdrawal = { ...newWithdrawal, multisigOpId: newOp.id };

    await emitAudit(tx as unknown as Db, {
      staffId,
      action: 'rebalance.created',
      resourceType: 'withdrawal',
      resourceId: newWithdrawal.id,
      changes: {
        operationType: 'hot_to_cold',
        chain,
        token,
        amount: amountMinor,
        destinationAddr,
        multisigOpId: newOp.id,
      },
    });
  });

  // 6. Emit event after commit
  socketEmitter.of('/stream').emit('rebalance.created', {
    id: withdrawal?.id,
    chain,
    token,
    amount: amountMinor,
    destinationAddr,
    status: withdrawal?.status,
    multisigOpId: withdrawal?.multisigOpId,
  });

  if (!withdrawal || !multisigOp) {
    throw new Error('Transaction completed but rows are undefined — unreachable');
  }

  return { withdrawal, multisigOp, destinationAddr };
}
