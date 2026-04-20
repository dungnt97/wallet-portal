// Seed staff_members — 8 staff matching prototype auth.jsx STAFF array
import type { Db } from '../index.js';
import { staffMembers } from '../schema/index.js';

export const STAFF_FIXTURES = [
  { email: 'alice@company.com', name: 'Alice Chen', role: 'admin' as const },
  { email: 'bob@company.com', name: 'Bob Nguyen', role: 'treasurer' as const },
  { email: 'carol@company.com', name: 'Carol Kim', role: 'treasurer' as const },
  { email: 'dave@company.com', name: 'Dave Patel', role: 'treasurer' as const },
  { email: 'eve@company.com', name: 'Eve Santos', role: 'operator' as const },
  { email: 'frank@company.com', name: 'Frank Liu', role: 'operator' as const },
  { email: 'grace@company.com', name: 'Grace Obi', role: 'viewer' as const },
  { email: 'henry@company.com', name: 'Henry Park', role: 'viewer' as const },
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
