// Seed wallets — reads real addresses from env when available, else uses dev placeholders.
// Env priority: SAFE_ADDRESS / COLD_SAFE_ADDRESS_BNB / SQUADS_MULTISIG_ADDRESS / COLD_SQUADS_ADDRESS_SOL
import type { Db } from '../index.js';
import { wallets } from '../schema/index.js';

const DEV_PLACEHOLDERS = {
  bnbHot: '0xHOT0SAFE00000000000000000000000000000001',
  bnbCold: '0xCOLD0SAFE0000000000000000000000000000002',
  solHot: 'HotSquadsAddressAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  solCold: 'ColdSquadsAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB',
} as const;

const resolveWalletFixtures = () => {
  const bnbHot = process.env.SAFE_ADDRESS?.trim() || DEV_PLACEHOLDERS.bnbHot;
  const bnbCold = process.env.COLD_SAFE_ADDRESS_BNB?.trim() || DEV_PLACEHOLDERS.bnbCold;
  const solHot = process.env.SQUADS_MULTISIG_ADDRESS?.trim() || DEV_PLACEHOLDERS.solHot;
  const solCold = process.env.COLD_SQUADS_ADDRESS_SOL?.trim() || DEV_PLACEHOLDERS.solCold;

  return [
    {
      chain: 'bnb' as const,
      address: bnbHot,
      tier: 'hot' as const,
      purpose: 'operational' as const,
      multisigAddr: bnbHot,
      derivationPath: null,
      policyConfig: {
        dailyLimitUsd: 1_000_000,
        timeLockSeconds: 0,
        bandFloorUsd: 400_000,
        bandCeilingUsd: 750_000,
      },
    },
    {
      chain: 'bnb' as const,
      address: bnbCold,
      tier: 'cold' as const,
      purpose: 'cold_reserve' as const,
      multisigAddr: bnbCold,
      derivationPath: null,
      policyConfig: {
        dailyLimitUsd: 5_000_000,
        timeLockSeconds: 172800,
        hwRequired: true,
        multisigType: 'gnosis_safe',
        signerLabel: 'Gnosis Safe · 3/5 signers',
        geographicLabel: 'HSM · Zürich vault',
      },
    },
    {
      chain: 'sol' as const,
      address: solHot,
      tier: 'hot' as const,
      purpose: 'operational' as const,
      multisigAddr: solHot,
      derivationPath: null,
      policyConfig: {
        dailyLimitUsd: 1_000_000,
        timeLockSeconds: 0,
        bandFloorUsd: 200_000,
        bandCeilingUsd: 500_000,
      },
    },
    {
      chain: 'sol' as const,
      address: solCold,
      tier: 'cold' as const,
      purpose: 'cold_reserve' as const,
      multisigAddr: solCold,
      derivationPath: null,
      policyConfig: {
        dailyLimitUsd: 5_000_000,
        timeLockSeconds: 172800,
        hwRequired: true,
        multisigType: 'squads',
        signerLabel: 'Squads · 3/5 signers',
        geographicLabel: 'HSM · Singapore vault',
      },
    },
  ];
};

export async function seedWallets(db: Db): Promise<void> {
  console.log('  Seeding wallets…');
  const fixtures = resolveWalletFixtures();
  const usingPlaceholders = fixtures.some((f) =>
    Object.values(DEV_PLACEHOLDERS).includes(
      f.address as (typeof DEV_PLACEHOLDERS)[keyof typeof DEV_PLACEHOLDERS]
    )
  );
  if (usingPlaceholders) {
    console.log(
      '  ⚠ One or more wallet addresses use dev placeholders. Set SAFE_ADDRESS / COLD_SAFE_ADDRESS_BNB / SQUADS_MULTISIG_ADDRESS / COLD_SQUADS_ADDRESS_SOL for real deployments.'
    );
  }

  for (const fixture of fixtures) {
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

  console.log(`  Inserted ${fixtures.length} wallets (skipped duplicates).`);
}
