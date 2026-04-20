// wallets table — custody wallet registry (HD deposit addresses + multisig operational wallets)
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, tierEnum, walletPurposeEnum } from './enums';

/**
 * Custody wallet entries.
 * deposit_hd: HD-derived per-user deposit address
 * operational: multisig hot safe (Safe on BNB, Squads on Solana)
 * cold_reserve: multisig cold safe with stricter policy
 */
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  chain: chainEnum('chain').notNull(),
  address: text('address').notNull().unique(),
  tier: tierEnum('tier').notNull(),
  purpose: walletPurposeEnum('purpose').notNull(),
  /** Safe/Squads contract address that controls this wallet (null for HD deposit addresses) */
  multisigAddr: text('multisig_addr'),
  /** BIP-44 derivation path — populated for deposit_hd wallets only */
  derivationPath: text('derivation_path'),
  /**
   * JSONB policy overrides: time-lock thresholds, daily limits, destination whitelist.
   * Validated by policy-engine at signing time; null = use global defaults.
   */
  policyConfig: jsonb('policy_config'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WalletRow = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
