// staff_members + staff_signing_keys tables
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, roleEnum, staffStatusEnum, tierEnum, walletTypeEnum } from './enums';
import type { NotificationPrefs } from './notifications.js';
import { DEFAULT_NOTIFICATION_PREFS } from './notifications.js';

/** Staff members who operate the custody portal */
export const staffMembers = pgTable('staff_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  status: staffStatusEnum('status').notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** Per-staff notification delivery preferences — channels + per-event-type opt-ins */
  notificationPrefs: jsonb('notification_prefs')
    .$type<NotificationPrefs>()
    .notNull()
    .default(DEFAULT_NOTIFICATION_PREFS),
  /** UI locale preference: 'en' | 'vi' — persisted per-staff (migration 0018) */
  localePref: text('locale_pref').notNull().default('en'),
  /** Mobile number for SMS notifications (migration 0018 / expanded in 0021) */
  phoneNumber: text('phone_number'),
  /** Short-lived signed invite token — cleared on first WebAuthn registration */
  inviteToken: text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type StaffMemberRow = typeof staffMembers.$inferSelect;
export type NewStaffMember = typeof staffMembers.$inferInsert;

/**
 * Hardware-attested signing keys registered to staff members.
 * A treasurer may have different addresses per tier:
 *   hot address from MetaMask, cold address from Ledger.
 */
export const staffSigningKeys = pgTable('staff_signing_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'restrict' }),
  chain: chainEnum('chain').notNull(),
  address: text('address').notNull(),
  tier: tierEnum('tier').notNull(),
  walletType: walletTypeEnum('wallet_type').notNull(),
  /** Proven hardware-backed at onboarding ceremony — required for cold tier */
  hwAttested: boolean('hw_attested').notNull().default(false),
  registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export type StaffSigningKeyRow = typeof staffSigningKeys.$inferSelect;
export type NewStaffSigningKey = typeof staffSigningKeys.$inferInsert;
