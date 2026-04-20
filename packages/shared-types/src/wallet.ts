import { z } from 'zod';
import { Chain, Tier } from './primitives.js';

export const WalletPurpose = z.enum(['deposit_hd', 'operational', 'cold_reserve']);
export type WalletPurpose = z.infer<typeof WalletPurpose>;

// A custody wallet entry — may be HD-derived (deposit) or multisig-controlled (operational/reserve)
export const Wallet = z.object({
  id: z.string().uuid(),
  chain: Chain,
  address: z.string(),
  tier: Tier,
  purpose: WalletPurpose,
  multisigAddr: z.string().nullable(),
  derivationPath: z.string().nullable(),
  // JSONB policy overrides stored as opaque record; validated by policy-engine at runtime
  policyConfig: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});
export type Wallet = z.infer<typeof Wallet>;
