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
  expiresAt: z.string().datetime(),
  status: MultisigOpStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MultisigOp = z.infer<typeof MultisigOp>;
