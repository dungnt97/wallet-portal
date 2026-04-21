import { sql } from 'drizzle-orm';
// system_kill_switch table — singleton row (id=1) controlling global outbound pause.
// Enabled state blocks new withdrawals/sweeps at create-time and in execute workers.
import { boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

/**
 * Singleton row (id always = 1, enforced by DB CHECK constraint).
 * Only toggled via POST /ops/kill-switch with WebAuthn step-up.
 */
export const systemKillSwitch = pgTable(
  'system_kill_switch',
  {
    /** Always 1 — singleton enforced by CHECK (id = 1) at DB layer */
    id: integer('id').primaryKey().default(1),
    /** When true, all withdrawal + sweep operations are blocked */
    enabled: boolean('enabled').notNull().default(false),
    /** Human-readable reason for enabling the kill-switch */
    reason: text('reason'),
    /** Staff member who last toggled the flag */
    updatedByStaffId: uuid('updated_by_staff_id').references(() => staffMembers.id, {
      onDelete: 'set null',
    }),
    /** Timestamp of last toggle */
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('kill_switch_singleton', sql`${table.id} = 1`)]
);

export type SystemKillSwitchRow = typeof systemKillSwitch.$inferSelect;
