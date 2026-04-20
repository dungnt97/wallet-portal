import { z } from 'zod';
import { Token } from './primitives.js';

// Double-entry ledger: every transaction produces balanced debit + credit entries
export const LedgerEntry = z.object({
  id: z.string().uuid(),
  txId: z.string().uuid(),
  // Account identifier — e.g. 'user:<uuid>', 'hot_safe', 'cold_reserve', 'fee'
  account: z.string(),
  // Exactly one of debit/credit is non-zero per entry; both stored for query clarity
  debit: z.string().regex(/^\d+(\.\d+)?$/),
  credit: z.string().regex(/^\d+(\.\d+)?$/),
  currency: Token,
  createdAt: z.string().datetime(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
