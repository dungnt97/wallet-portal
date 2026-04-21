// users + user_addresses tables
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, kycTierEnum, tierEnum, userStatusEnum } from './enums';
import { staffMembers } from './staff.js';

export type RiskTier = 'low' | 'medium' | 'high' | 'frozen';

/** End-users whose funds are held in custody */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  kycTier: kycTierEnum('kyc_tier').notNull().default('none'),
  /** Legacy numeric score 0-100 — superseded by risk_tier (migration 0019) */
  riskScore: integer('risk_score').notNull().default(0),
  /** Categorical risk tier — used by policy engine daily_limit multiplier */
  riskTier: text('risk_tier').$type<RiskTier>().notNull().default('low'),
  /** Reason text for the most recent tier change */
  riskReason: text('risk_reason'),
  /** Timestamp of last risk tier update */
  riskUpdatedAt: timestamp('risk_updated_at', { withTimezone: true }),
  /** Staff member who last updated the risk tier */
  riskUpdatedBy: uuid('risk_updated_by').references(() => staffMembers.id),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Chain addresses assigned to users via HD derivation.
 * Each user gets exactly one address per chain (enforced by ux_user_addresses_user_chain).
 * derivation_index is globally unique per chain (ux_user_addresses_chain_idx) so two
 * users never share the same HD slot.
 */
export const userAddresses = pgTable(
  'user_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    chain: chainEnum('chain').notNull(),
    address: text('address').notNull().unique(),
    /** BIP-44 derivation path, e.g. m/44'/60'/0'/0/5 */
    derivationPath: text('derivation_path'),
    /** 0-based HD derivation index — unique per chain across all users */
    derivationIndex: integer('derivation_index').notNull(),
    tier: tierEnum('tier').notNull().default('hot'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    /** Global uniqueness: one HD slot per chain prevents address reuse */
    uniqChainIndex: uniqueIndex('ux_user_addresses_chain_idx').on(t.chain, t.derivationIndex),
    /** Per-user uniqueness: one BNB + one SOL address per user */
    uniqUserChain: uniqueIndex('ux_user_addresses_user_chain').on(t.userId, t.chain),
    /** Fast lookup by userId for address list queries */
    byUser: index('ix_user_addresses_user').on(t.userId),
  })
);

export type UserAddressRow = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;
