import { z } from 'zod';
import { Chain, Role, Tier } from './primitives.js';

export const StaffStatus = z.enum(['active', 'suspended', 'offboarded']);
export type StaffStatus = z.infer<typeof StaffStatus>;

export const StaffMember = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: Role,
  status: StaffStatus,
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type StaffMember = z.infer<typeof StaffMember>;

export const WalletType = z.enum(['metamask', 'phantom', 'ledger', 'other']);
export type WalletType = z.infer<typeof WalletType>;

// A hardware-attested signing key registered to a staff member for a specific chain + tier
export const StaffSigningKey = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  chain: Chain,
  address: z.string(),
  tier: Tier,
  walletType: WalletType,
  hwAttested: z.boolean(),
  registeredAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});
export type StaffSigningKey = z.infer<typeof StaffSigningKey>;
