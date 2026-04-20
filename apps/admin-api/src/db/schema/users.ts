// users + user_addresses tables
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, kycTierEnum, tierEnum, userStatusEnum } from './enums';

/** End-users whose funds are held in custody */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  kycTier: kycTierEnum('kyc_tier').notNull().default('none'),
  /** Risk score 0-100: 0 = lowest risk, 100 = highest risk */
  riskScore: integer('risk_score').notNull().default(0),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Chain addresses assigned to users via HD derivation.
 * One user may have multiple addresses across chains and tiers.
 */
export const userAddresses = pgTable('user_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  chain: chainEnum('chain').notNull(),
  address: text('address').notNull().unique(),
  /** BIP-44 derivation path, e.g. m/44'/60'/0'/0/5 */
  derivationPath: text('derivation_path'),
  tier: tierEnum('tier').notNull().default('hot'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserAddressRow = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;
