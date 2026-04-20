import { z } from 'zod';
import { Chain, Tier } from './primitives.js';

export const KycTier = z.enum(['none', 'basic', 'enhanced']);
export type KycTier = z.infer<typeof KycTier>;

export const UserStatus = z.enum(['active', 'suspended', 'closed']);
export type UserStatus = z.infer<typeof UserStatus>;

export const UserRecord = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  kycTier: KycTier,
  riskScore: z.number().int().min(0).max(100),
  status: UserStatus,
  createdAt: z.string().datetime(),
});
export type UserRecord = z.infer<typeof UserRecord>;

// A chain address assigned to a user, derived via HD path
export const UserAddress = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chain: Chain,
  address: z.string(),
  derivationPath: z.string().nullable(),
  tier: Tier,
  createdAt: z.string().datetime(),
});
export type UserAddress = z.infer<typeof UserAddress>;
