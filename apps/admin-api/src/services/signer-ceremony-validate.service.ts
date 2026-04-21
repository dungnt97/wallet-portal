// Shared validation helpers for signer ceremony services.
// Isolated so signer-add/remove/rotate services stay under 200 lines each.
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

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

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StaffWithKeys {
  staff: typeof schema.staffMembers.$inferSelect;
  bnbKey: typeof schema.staffSigningKeys.$inferSelect;
  solanaKey: typeof schema.staffSigningKeys.$inferSelect;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load a staff member by id; throw NotFoundError if missing.
 */
export async function loadStaff(
  db: Db,
  staffId: string
): Promise<typeof schema.staffMembers.$inferSelect> {
  const staff = await db.query.staffMembers.findFirst({
    where: eq(schema.staffMembers.id, staffId),
  });
  if (!staff) throw new NotFoundError(`Staff ${staffId} not found`);
  return staff;
}

/**
 * Validate a staff member has active (non-revoked) signing keys on BOTH chains.
 * Returns the two key rows; throws ValidationError if any is missing.
 */
export async function requireActiveKeysForBothChains(
  db: Db,
  staffId: string
): Promise<{
  bnbKey: typeof schema.staffSigningKeys.$inferSelect;
  solanaKey: typeof schema.staffSigningKeys.$inferSelect;
}> {
  const keys = await db.query.staffSigningKeys.findMany({
    where: and(
      eq(schema.staffSigningKeys.staffId, staffId),
      isNull(schema.staffSigningKeys.revokedAt)
    ),
  });

  const bnbKey = keys.find((k) => k.chain === 'bnb');
  const solanaKey = keys.find((k) => k.chain === 'sol');

  if (!bnbKey) {
    throw new ValidationError(`Staff ${staffId} has no active BNB signing key — register it first`);
  }
  if (!solanaKey) {
    throw new ValidationError(
      `Staff ${staffId} has no active Solana signing key — register it first`
    );
  }

  return { bnbKey, solanaKey };
}

/**
 * Count current active treasurers + collect their active multisig addresses.
 * Used to validate threshold constraints before creating a ceremony.
 */
export async function getActiveTreasurerCount(db: Db): Promise<number> {
  const rows = await db.query.staffMembers.findMany({
    where: and(eq(schema.staffMembers.role, 'treasurer'), eq(schema.staffMembers.status, 'active')),
  });
  return rows.length;
}

/**
 * Create one multisig_operations row for a ceremony on a given chain.
 * Returns the new row id.
 */
export async function insertCeremonyMultisigOp(
  db: Db,
  params: {
    ceremonyId: string;
    chain: 'bnb' | 'sol';
    operationType: 'signer_add' | 'signer_remove' | 'signer_rotate';
  }
): Promise<string> {
  const multisigAddr =
    params.chain === 'bnb'
      ? (process.env.SAFE_ADDRESS ?? '0x0000000000000000000000000000000000000001')
      : (process.env.SQUADS_MULTISIG_ADDRESS ?? '11111111111111111111111111111111');

  const opExpiresAt = new Date();
  opExpiresAt.setHours(opExpiresAt.getHours() + 72); // ceremonies get 72h window

  const [op] = await db
    .insert(schema.multisigOperations)
    .values({
      chain: params.chain,
      operationType: params.operationType,
      multisigAddr,
      requiredSigs: 2,
      collectedSigs: 0,
      expiresAt: opExpiresAt,
      status: 'pending',
    })
    .returning();

  if (!op) throw new Error('Failed to insert multisig_operations row');
  return op.id;
}
