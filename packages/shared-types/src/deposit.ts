import { z } from 'zod';
import { Chain, Token } from './primitives.js';

export const DepositStatus = z.enum(['pending', 'credited', 'swept', 'failed']);
export type DepositStatus = z.infer<typeof DepositStatus>;

export const Deposit = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chain: Chain,
  token: Token,
  // Stored as string to avoid floating-point precision loss on large amounts
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  status: DepositStatus,
  confirmedBlocks: z.number().int().nonnegative(),
  txHash: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Deposit = z.infer<typeof Deposit>;
