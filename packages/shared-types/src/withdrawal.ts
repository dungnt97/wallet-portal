import { z } from 'zod';
import { Chain, Tier, Token } from './primitives.js';

export const WithdrawalStatus = z.enum([
  'pending',
  'approved',
  'time_locked',
  'executing',
  'broadcast',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
]);
export type WithdrawalStatus = z.infer<typeof WithdrawalStatus>;

export const Withdrawal = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chain: Chain,
  token: Token,
  // Stored as string to avoid floating-point precision loss on large amounts
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  destinationAddr: z.string(),
  status: WithdrawalStatus,
  sourceTier: Tier,
  multisigOpId: z.string().uuid().nullable(),
  timeLockExpiresAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Withdrawal = z.infer<typeof Withdrawal>;
