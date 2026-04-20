import { z } from 'zod';

// Chain identifiers supported by wallet-portal
export const Chain = z.enum(['bnb', 'sol']);
export type Chain = z.infer<typeof Chain>;

// Stablecoin tokens supported across all chains
export const Token = z.enum(['USDT', 'USDC']);
export type Token = z.infer<typeof Token>;

// Wallet tier: hot = operationally accessible, cold = restricted/air-gapped policy
export const Tier = z.enum(['hot', 'cold']);
export type Tier = z.infer<typeof Tier>;

// Staff access roles — ordered from most to least privileged
export const Role = z.enum(['admin', 'treasurer', 'operator', 'viewer']);
export type Role = z.infer<typeof Role>;
