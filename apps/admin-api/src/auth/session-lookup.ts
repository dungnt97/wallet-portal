import { eq } from 'drizzle-orm';
// Session staff lookup — email → staff DB query.
// Used by POST /auth/session/dev-login (AUTH_DEV_MODE) and the OIDC callback
// to resolve and validate the authenticated staff member from the database.
// P06 OIDC flow calls lookupStaffByEmail after id_token verification.
import type { Db } from '../db/index.js';
import { staffMembers } from '../db/schema/index.js';

export type SessionStaff = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'treasurer' | 'operator' | 'viewer';
};

/**
 * Look up a staff member by email.
 * Returns null if not found or account is not active.
 * P06 replaces this with Google OIDC token verification.
 */
export async function lookupStaffByEmail(db: Db, email: string): Promise<SessionStaff | null> {
  const rows = await db
    .select({
      id: staffMembers.id,
      email: staffMembers.email,
      name: staffMembers.name,
      role: staffMembers.role,
      status: staffMembers.status,
    })
    .from(staffMembers)
    .where(eq(staffMembers.email, email))
    .limit(1);

  const staff = rows[0];
  if (!staff || staff.status !== 'active') return null;

  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
  };
}
