// multisig_operations + multisig_approvals tables
import { customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, multisigStatusEnum } from './enums';
import { staffMembers } from './staff';
import { staffSigningKeys } from './staff';

// Drizzle does not ship a first-class bytea helper; define a minimal custom type.
const bytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * A multisig signing round tied to a withdrawal or sweep.
 * Tracks required vs collected signatures and on-chain submission state.
 */
export const multisigOperations = pgTable('multisig_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Nullable: sweeps may not have an associated withdrawal */
  withdrawalId: uuid('withdrawal_id'),
  chain: chainEnum('chain').notNull(),
  /** e.g. 'withdrawal', 'sweep', 'hot_to_cold' */
  operationType: text('operation_type').notNull(),
  /** Safe/Squads contract address */
  multisigAddr: text('multisig_addr').notNull(),
  requiredSigs: integer('required_sigs').notNull(),
  collectedSigs: integer('collected_sigs').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: multisigStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type MultisigOperationRow = typeof multisigOperations.$inferSelect;
export type NewMultisigOperation = typeof multisigOperations.$inferInsert;

/**
 * Individual approval (signature) submitted by a treasurer for a multisig operation.
 * One row per treasurer per operation.
 */
export const multisigApprovals = pgTable('multisig_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  opId: uuid('op_id')
    .notNull()
    .references(() => multisigOperations.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'restrict' }),
  staffSigningKeyId: uuid('staff_signing_key_id')
    .notNull()
    .references(() => staffSigningKeys.id, { onDelete: 'restrict' }),
  /** EIP-712 signature (BNB) or base58-encoded Squads approval (Solana) */
  signature: text('signature').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).defaultNow().notNull(),
  /**
   * Slice 7 HW-attestation: raw bytes of the hardware-wallet signed payload.
   * NULL for hot-tier operations. Required for cold-tier per policy rule.
   */
  attestationBlob: bytea('attestation_blob'),
  /**
   * Slice 7 HW-attestation: which device produced the blob.
   * Values: 'ledger' | 'trezor' | 'none' | NULL (hot-tier, no device required).
   * CHECK constraint enforced at DB level in migration 0011.
   */
  attestationType: text('attestation_type'),
});

export type MultisigApprovalRow = typeof multisigApprovals.$inferSelect;
export type NewMultisigApproval = typeof multisigApprovals.$inferInsert;
