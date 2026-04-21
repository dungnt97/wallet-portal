// signer_ceremonies table — tracks add/remove/rotate multisig owner ceremonies
// spanning Safe (BNB) + Squads (Solana) with per-chain progress + aggregate status.
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff.js';

// ── Per-chain status values ───────────────────────────────────────────────────

export type ChainCeremonyStatus =
  | 'pending'
  | 'signing'
  | 'executing'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export interface ChainCeremonyState {
  status: ChainCeremonyStatus;
  /** On-chain tx hash once broadcast */
  txHash?: string;
  /** Linked multisig_operations row id */
  multisigOpId?: string;
  /** Error reason if status=failed */
  errorReason?: string;
}

export type CeremonyChainStates = {
  bnb?: ChainCeremonyState;
  solana?: ChainCeremonyState;
};

// ── Aggregate ceremony status values ─────────────────────────────────────────

export type CeremonyStatus =
  | 'pending'
  | 'in_progress'
  | 'confirmed'
  | 'partial'
  | 'failed'
  | 'cancelled';

// ── Operation type ────────────────────────────────────────────────────────────

export type CeremonyOperationType = 'signer_add' | 'signer_remove' | 'signer_rotate';

// ── Table definition ──────────────────────────────────────────────────────────

/**
 * Tracks a signer ceremony lifecycle (add/remove/rotate) across Safe + Squads.
 * One row per ceremony; per-chain progress stored in chain_states jsonb.
 */
export const signerCeremonies = pgTable('signer_ceremonies', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationType: text('operation_type').$type<CeremonyOperationType>().notNull(),
  initiatedBy: uuid('initiated_by')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'restrict' }),
  /** Staff ids to add as multisig owners — empty for remove-only operations */
  targetAdd: uuid('target_add').array().notNull().default([]),
  /** Staff ids to remove as multisig owners — empty for add-only operations */
  targetRemove: uuid('target_remove').array().notNull().default([]),
  /** Per-chain execution state keyed by chain name */
  chainStates: jsonb('chain_states').$type<CeremonyChainStates>().notNull().default({}),
  /** Aggregate status — derived from per-chain states after each update */
  status: text('status').$type<CeremonyStatus>().notNull().default('pending'),
  /** Optional operator note */
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SignerCeremonyRow = typeof signerCeremonies.$inferSelect;
export type NewSignerCeremony = typeof signerCeremonies.$inferInsert;
