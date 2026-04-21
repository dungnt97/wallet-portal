// User creation saga — INSERT users row, then trigger wallet-engine HD derivation.
// Saga pattern: user row persists even if derivation fails (retryable via POST /users/:id/derive-addresses).
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import type { DerivedAddress, WalletEngineClientOptions } from './wallet-engine-client.js';
import { WalletEngineError, deriveUserAddresses } from './wallet-engine-client.js';

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DerivationFailedError extends Error {
  readonly statusCode = 502;
  readonly code = 'DERIVATION_FAILED';
  constructor(
    message: string,
    public readonly userId: string
  ) {
    super(message);
    this.name = 'DerivationFailedError';
  }
}

export interface CreateUserInput {
  email: string;
  kycTier?: 'none' | 'basic' | 'enhanced';
  staffId: string;
  ipAddr?: string;
}

export interface CreateUserResult {
  user: typeof schema.users.$inferSelect;
  addresses: DerivedAddress[];
  derivationPartial: boolean;
}

/**
 * Create end-user: INSERT users row, emit audit, then derive HD addresses.
 * If wallet-engine derivation fails the user row is kept (idempotent retry via retry-derive endpoint).
 */
export async function createUser(
  db: Db,
  walletEngineOpts: WalletEngineClientOptions,
  input: CreateUserInput
): Promise<CreateUserResult> {
  const { staffId, ipAddr } = input;
  const email = input.email.toLowerCase().trim();
  const kycTier = input.kycTier ?? 'none';

  // Step 1 — INSERT user row (unique email constraint catches duplicates)
  let userRow: typeof schema.users.$inferSelect;
  try {
    const rows = await db
      .insert(schema.users)
      .values({ email, kycTier, status: 'active' })
      .returning();
    const inserted = rows[0];
    if (!inserted) throw new Error('INSERT users returned no rows');
    userRow = inserted;
  } catch (err: unknown) {
    // Postgres unique violation code 23505
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      throw new ConflictError(`Email already registered: ${email}`);
    }
    throw err;
  }

  // Step 2 — Audit: user.created (outside tx — audit always appended after commit)
  await emitAudit(db, {
    staffId,
    action: 'user.created',
    resourceType: 'user',
    resourceId: userRow.id,
    changes: { email, kycTier },
    ...(ipAddr !== undefined && { ipAddr }),
  });

  // Step 3 — Trigger wallet-engine HD derivation (saga: failure does not rollback user)
  try {
    const { addresses } = await deriveUserAddresses(walletEngineOpts, userRow.id);
    return { user: userRow, addresses, derivationPartial: false };
  } catch (err: unknown) {
    const httpStatus = err instanceof WalletEngineError ? err.status : 0;
    const reason = err instanceof Error ? err.message : String(err);

    // Audit the partial-create so ops can see it and use retry endpoint
    await emitAudit(db, {
      staffId: null,
      action: 'user.created.derivation_failed',
      resourceType: 'user',
      resourceId: userRow.id,
      changes: { reason, httpStatus },
    }).catch(() => {
      // Non-fatal: don't mask original derivation error with audit error
    });

    throw new DerivationFailedError(
      `User ${userRow.id} created but address derivation failed: ${reason}`,
      userRow.id
    );
  }
}
