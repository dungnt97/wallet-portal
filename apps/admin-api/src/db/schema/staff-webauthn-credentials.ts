// staff_webauthn_credentials — stores WebAuthn authenticator registrations per staff member
// Each row is one registered security key / passkey.
// Public key is stored as raw bytes; drizzle uses customType since pg-core lacks a bytea builder.
import { bigint, customType, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

// Custom bytea column type — stores Uint8Array/Buffer as PostgreSQL bytea
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(val) {
    return val;
  },
  fromDriver(val) {
    return val instanceof Buffer ? val : Buffer.from(val as unknown as ArrayBuffer);
  },
});

export const staffWebauthnCredentials = pgTable('staff_webauthn_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'cascade' }),
  /** Credential ID returned by the authenticator — base64url string */
  credentialId: text('credential_id').notNull().unique(),
  /** COSE-encoded public key bytes */
  publicKey: bytea('public_key').notNull(),
  /** Authenticator counter — strictly increasing to detect cloned keys */
  counter: bigint('counter', { mode: 'bigint' }).notNull().default(BigInt(0)),
  /** Authenticator transports hint (e.g. ["internal"], ["usb", "nfc"]) */
  transports: text('transports').array().notNull().default([]),
  /** Human-readable label set by the staff member at registration */
  deviceName: text('device_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export type StaffWebauthnCredentialRow = typeof staffWebauthnCredentials.$inferSelect;
export type NewStaffWebauthnCredential = typeof staffWebauthnCredentials.$inferInsert;
