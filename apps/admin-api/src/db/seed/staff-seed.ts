// Seed staff_members — 8 staff matching prototype auth.jsx STAFF array
import type { Db } from '../index.js';
import { staffMembers } from '../schema/index.js';

// Matches prototype `portal/src/auth.jsx` STAFF array
export const STAFF_FIXTURES = [
  { email: 'mira@treasury.io', name: 'Mira Sato', role: 'admin' as const },
  { email: 'ben@treasury.io', name: 'Ben Foster', role: 'treasurer' as const },
  { email: 'hana@treasury.io', name: 'Hana Petersen', role: 'treasurer' as const },
  { email: 'ana@treasury.io', name: 'Ana Müller', role: 'treasurer' as const },
  { email: 'tomas@treasury.io', name: 'Tomás Ribeiro', role: 'operator' as const },
  { email: 'iris@treasury.io', name: 'Iris Bergström', role: 'operator' as const },
  { email: 'kenji@treasury.io', name: 'Kenji Mori', role: 'viewer' as const },
] as const;

export async function seedStaff(db: Db): Promise<void> {
  console.log('  Seeding staff_members…');

  const rows = STAFF_FIXTURES.map((s) => ({
    email: s.email,
    name: s.name,
    role: s.role,
    status: 'active' as const,
  }));

  // ON CONFLICT DO NOTHING — idempotent re-runs
  await db.insert(staffMembers).values(rows).onConflictDoNothing();

  console.log(`  Inserted ${rows.length} staff members (skipped duplicates).`);
}
