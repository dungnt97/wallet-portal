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
  /** hot_to_cold (default) or cold_to_hot */
  direction?: 'hot_to_cold' | 'cold_to_hot';
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
 * Create a rebalance operation — supports hot_to_cold (default) and cold_to_hot:
 *  1. Kill-switch guard
 *  2. Resolve source + destination wallets based on direction
 *  3. Policy Engine pre-check — whitelist fast-path covers both intra-custody directions
 *  4. DB transaction: INSERT withdrawals + multisig_operations
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
  const direction = input.direction ?? 'hot_to_cold';

  // 1. Kill-switch guard
  const ksState = await getKillSwitchState(db);
  if (ksState.enabled) {
    throw new KillSwitchEnabledError(ksState.reason);
  }

  // 2. Resolve destination wallet based on direction
  let destinationAddr: string;
  let sourceTier: 'hot' | 'cold';

  if (direction === 'hot_to_cold') {
    // hot → cold: source=hot operational, destination=cold_reserve
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
    destinationAddr = coldWallet.address;
    sourceTier = 'hot';
  } else {
    // cold → hot: source=cold_reserve, destination=hot operational
    const hotWallet = await db.query.wallets.findFirst({
      where: and(eq(schema.wallets.chain, chain), eq(schema.wallets.purpose, 'operational')),
    });
    if (!hotWallet) {
      throw new NotFoundError(
        `No operational (hot) wallet registered for chain=${chain}. Add one via wallets seed.`
      );
    }
    destinationAddr = hotWallet.address;
    sourceTier = 'cold';
  }

  // 3. Resolve a userId for the FK (rebalances have no end-user)
  const userId = await resolveHotSourceUserId(db);

  // 4. Policy Engine pre-check — both directions are intra-custody whitelist fast-path
  const policyResult = await checkPolicy(policyOpts, {
    operationType: 'hot_to_cold', // policy-engine whitelist covers both intra-custody directions
    actorStaffId: staffId,
    destinationAddr,
    amount: amountMinor,
    chain,
    tier: sourceTier,
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
        sourceTier,
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
        // always 'hot_to_cold' as the operation type — cold_to_hot is tracked via sourceTier
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
        direction,
        operationType: 'hot_to_cold',
        chain,
        token,
        amount: amountMinor,
        destinationAddr,
        sourceTier,
        multisigOpId: newOp.id,
      },
    });
  });

  // 6. Emit event after commit
  socketEmitter.of('/stream').emit('rebalance.created', {
    id: withdrawal?.id,
    direction,
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
