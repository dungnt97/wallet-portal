import { z } from 'zod';
import { Chain } from './primitives.js';

export const MultisigOpStatus = z.enum([
  'pending',
  'collecting',
  'ready',
  'submitted',
  'confirmed',
  'expired',
  'failed',
]);
export type MultisigOpStatus = z.infer<typeof MultisigOpStatus>;

export const MultisigOp = z.object({
  id: z.string().uuid(),
  withdrawalId: z.string().uuid().nullable(),
  chain: Chain,
  operationType: z.string(),
  multisigAddr: z.string(),
  requiredSigs: z.number().int().positive(),
  collectedSigs: z.number().int().nonnegative(),
  /** Total active signing-key holders for this chain (from staff_signing_keys). */
  totalSigners: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime(),
  status: MultisigOpStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Withdrawal-linked fields — null for non-withdrawal ops (signer ceremony, rebalance, etc.)
  withdrawalAmount: z.string().nullable().optional(),
  withdrawalToken: z.string().nullable().optional(),
  withdrawalDestination: z.string().nullable().optional(),
  withdrawalNonce: z.number().nullable().optional(),
});
export type MultisigOp = z.infer<typeof MultisigOp>;
