// account-settings.service — PATCH /staff/me profile update + logout-all sessions
// Handles: name, locale_pref update; session revocation for self.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';

export interface UpdateProfileParams {
  staffId: string;
  name?: string | undefined;
  localePref?: string | undefined;
}

export interface UpdateProfileResult {
  id: string;
  name: string;
  email: string;
  localePref: string;
}

const VALID_LOCALES = new Set(['en', 'vi']);

/**
 * Update staff member's name and/or locale preference.
 * Returns updated profile row. Emits audit entry.
 */
export async function updateProfile(
  db: Db,
  params: UpdateProfileParams
): Promise<UpdateProfileResult> {
  const { staffId, name, localePref } = params;

  if (localePref !== undefined && !VALID_LOCALES.has(localePref)) {
    throw new Error(
      `Invalid locale: ${localePref}. Must be one of: ${[...VALID_LOCALES].join(', ')}`
    );
  }

  const updates: Partial<typeof schema.staffMembers.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (name !== undefined) updates.name = name.trim();
  if (localePref !== undefined) updates.localePref = localePref;

  const [updated] = await db
    .update(schema.staffMembers)
    .set(updates)
    .where(eq(schema.staffMembers.id, staffId))
    .returning({
      id: schema.staffMembers.id,
      name: schema.staffMembers.name,
      email: schema.staffMembers.email,
      localePref: schema.staffMembers.localePref,
    });

  if (!updated) throw new Error('Staff member not found');

  await emitAudit(db, {
    staffId,
    action: 'staff.profile.updated',
    resourceType: 'staff',
    resourceId: staffId,
    changes: { name, localePref },
  });

  return updated;
}
