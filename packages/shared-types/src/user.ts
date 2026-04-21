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
  /** 0-based HD derivation index, unique per chain across all users */
  derivationIndex: z.number().int().min(0),
  tier: Tier,
  createdAt: z.string().datetime(),
});
export type UserAddress = z.infer<typeof UserAddress>;

// On-chain balance per token as returned by GET /users/:id/addresses (Redis cache)
export const AddressBalance = z.object({
  USDT: z.string().nullable(),
  USDC: z.string().nullable(),
});
export type AddressBalance = z.infer<typeof AddressBalance>;

// Address with cached on-chain balance
export const UserAddressWithBalance = UserAddress.extend({
  balance: AddressBalance.nullable(),
  cached: z.boolean(),
});
export type UserAddressWithBalance = z.infer<typeof UserAddressWithBalance>;

// Ledger-derived balance summary per currency
export const UserBalance = z.object({
  USDT: z.string(),
  USDC: z.string(),
});
export type UserBalance = z.infer<typeof UserBalance>;

// Derived address returned by wallet-engine after HD derivation
export const DerivedAddress = z.object({
  chain: Chain,
  address: z.string(),
  derivationPath: z.string(),
  derivationIndex: z.number().int().min(0),
});
export type DerivedAddress = z.infer<typeof DerivedAddress>;
