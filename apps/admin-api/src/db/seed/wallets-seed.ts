// Seed wallets — 4 placeholder wallets: 2 chains × 2 tiers (hot operational + cold reserve)
import type { Db } from '../index.js';
import { wallets } from '../schema/index.js';

const WALLET_FIXTURES = [
  {
    chain: 'bnb' as const,
    address: '0xHOT0SAFE00000000000000000000000000000001',
    tier: 'hot' as const,
    purpose: 'operational' as const,
    multisigAddr: '0xHOT0SAFE00000000000000000000000000000001',
    derivationPath: null,
    policyConfig: { dailyLimitUsd: 1_000_000, timeLockSeconds: 0 },
  },
  {
    chain: 'bnb' as const,
    address: '0xCOLD0SAFE0000000000000000000000000000002',
    tier: 'cold' as const,
    purpose: 'cold_reserve' as const,
    multisigAddr: '0xCOLD0SAFE0000000000000000000000000000002',
    derivationPath: null,
    policyConfig: { dailyLimitUsd: 5_000_000, timeLockSeconds: 172800, hwRequired: true },
  },
  {
    chain: 'sol' as const,
    address: 'HotSquadsAddressAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    tier: 'hot' as const,
    purpose: 'operational' as const,
    multisigAddr: 'HotSquadsAddressAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    derivationPath: null,
    policyConfig: { dailyLimitUsd: 1_000_000, timeLockSeconds: 0 },
  },
  {
    chain: 'sol' as const,
    address: 'ColdSquadsAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    tier: 'cold' as const,
    purpose: 'cold_reserve' as const,
    multisigAddr: 'ColdSquadsAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    derivationPath: null,
    policyConfig: { dailyLimitUsd: 5_000_000, timeLockSeconds: 172800, hwRequired: true },
  },
] as const;

export async function seedWallets(db: Db): Promise<void> {
  console.log('  Seeding wallets…');

  for (const fixture of WALLET_FIXTURES) {
    await db
      .insert(wallets)
      .values({
        chain: fixture.chain,
        address: fixture.address,
        tier: fixture.tier,
        purpose: fixture.purpose,
        multisigAddr: fixture.multisigAddr,
        derivationPath: fixture.derivationPath,
        policyConfig: fixture.policyConfig,
      })
      .onConflictDoNothing();
  }

  console.log(`  Inserted ${WALLET_FIXTURES.length} wallets (skipped duplicates).`);
}
