// Seed users + user_addresses — 3 test users with HD deposit addresses
import type { Db } from '../index.js';
import { userAddresses, users } from '../schema/index.js';

const USER_FIXTURES = [
  {
    email: 'testuser1@example.com',
    kycTier: 'basic' as const,
    riskScore: 10,
    addresses: [
      { chain: 'bnb' as const, address: '0xDEAD0001000000000000000000000000000000A1', derivationPath: "m/44'/60'/0'/0/0", tier: 'hot' as const },
      { chain: 'sol' as const, address: 'Fixture1SolanaAddressAAAAAAAAAAAAAAAAAAAAAAAAAA', derivationPath: "m/44'/501'/0'/0/0", tier: 'hot' as const },
    ],
  },
  {
    email: 'testuser2@example.com',
    kycTier: 'enhanced' as const,
    riskScore: 5,
    addresses: [
      { chain: 'bnb' as const, address: '0xDEAD0002000000000000000000000000000000A2', derivationPath: "m/44'/60'/0'/0/1", tier: 'hot' as const },
    ],
  },
  {
    email: 'testuser3@example.com',
    kycTier: 'none' as const,
    riskScore: 0,
    addresses: [],
  },
] as const;

export async function seedUsers(db: Db): Promise<void> {
  console.log('  Seeding users + user_addresses…');

  for (const fixture of USER_FIXTURES) {
    // Insert user — idempotent
    const inserted = await db
      .insert(users)
      .values({
        email: fixture.email,
        kycTier: fixture.kycTier,
        riskScore: fixture.riskScore,
        status: 'active',
      })
      .onConflictDoNothing()
      .returning({ id: users.id });

    // Only insert addresses if user was freshly inserted
    if (inserted.length > 0 && fixture.addresses.length > 0) {
      const userId = inserted[0]!.id;
      const addrRows = fixture.addresses.map((a) => ({
        userId,
        chain: a.chain,
        address: a.address,
        derivationPath: a.derivationPath,
        tier: a.tier,
      }));
      await db.insert(userAddresses).values(addrRows).onConflictDoNothing();
    }
  }

  console.log(`  Inserted ${USER_FIXTURES.length} users.`);
}
