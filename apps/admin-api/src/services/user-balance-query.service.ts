// Ledger-derived balance query — sums credit-debit per currency for a user account.
// Account format: 'user:<userId>' (matches ledger_entries.account column).
import { sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface UserBalance {
  USDT: string;
  USDC: string;
}

/**
 * Aggregate ledger_entries for account='user:<userId>' grouped by currency.
 * Returns zero strings for currencies with no entries.
 * Decimal precision preserved as string (36,18 scale in DB).
 */
export async function getUserBalance(db: Db, userId: string): Promise<UserBalance> {
  const account = `user:${userId}`;

  const rows = await db
    .select({
      currency: schema.ledgerEntries.currency,
      // SUM(credit - debit) = net balance; uses numeric arithmetic in Postgres
      net: sql<string>`SUM(${schema.ledgerEntries.credit} - ${schema.ledgerEntries.debit})`,
    })
    .from(schema.ledgerEntries)
    .where(sql`${schema.ledgerEntries.account} = ${account}`)
    .groupBy(schema.ledgerEntries.currency);

  const result: UserBalance = { USDT: '0', USDC: '0' };
  for (const row of rows) {
    const net = row.net ?? '0';
    if (row.currency === 'USDT') result.USDT = net;
    else if (row.currency === 'USDC') result.USDC = net;
  }
  return result;
}
