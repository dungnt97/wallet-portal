// Idempotent retry for HD address derivation — safe to call multiple times.
// Called when user was created but wallet-engine derivation failed.
// Checks per-chain address count; only calls wallet-engine if at least one chain is missing.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import type { DerivedAddress, WalletEngineClientOptions } from './wallet-engine-client.js';
import { WalletEngineError, deriveUserAddresses } from './wallet-engine-client.js';

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class DerivationFailedError extends Error {
  readonly statusCode = 502;
  readonly code = 'DERIVATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'DerivationFailedError';
  }
}

export interface RetryDeriveResult {
  addresses: DerivedAddress[];
  alreadyComplete: boolean;
}

const EXPECTED_CHAINS: Array<'bnb' | 'sol'> = ['bnb', 'sol'];

/**
 * Retry HD address derivation for a user.
 * If all expected chains already have an address → returns existing, alreadyComplete=true.
 * Otherwise calls wallet-engine (which is itself idempotent) and audits the result.
 */
export async function retryDeriveUserAddresses(
  db: Db,
  walletEngineOpts: WalletEngineClientOptions,
  userId: string,
  staffId: string
): Promise<RetryDeriveResult> {
  // Verify user exists
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  // Check existing addresses per chain
  const existing = await db
    .select({ chain: schema.userAddresses.chain })
    .from(schema.userAddresses)
    .where(eq(schema.userAddresses.userId, userId));

  const coveredChains = new Set(existing.map((r) => r.chain));
  const allPresent = EXPECTED_CHAINS.every((c) => coveredChains.has(c));

  if (allPresent) {
    // Already fully derived — wallet-engine call would be idempotent but skip for clarity
    const fullRows = await db
      .select()
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, userId));

    return {
      addresses: fullRows.map((r) => ({
        chain: r.chain,
        address: r.address,
        derivationPath: r.derivationPath ?? '',
        derivationIndex: r.derivationIndex,
      })),
      alreadyComplete: true,
    };
  }

  // Call wallet-engine — idempotent, will skip already-derived chains
  try {
    const { addresses } = await deriveUserAddresses(walletEngineOpts, userId);

    await emitAudit(db, {
      staffId,
      action: 'user.addresses_derived',
      resourceType: 'user',
      resourceId: userId,
      changes: { chains: addresses.map((a) => a.chain) },
    });

    return { addresses, alreadyComplete: false };
  } catch (err: unknown) {
    const httpStatus = err instanceof WalletEngineError ? err.status : 0;
    const reason = err instanceof Error ? err.message : String(err);
    throw new DerivationFailedError(
      `Retry derivation failed for user ${userId} (status=${httpStatus}): ${reason}`
    );
  }
}
