// reconciliation-ledger-expected.service — computes expected balances from ledger_entries
// for each (accountLabel, token) pair using a single aggregate SQL query.
//
// Ledger balance = SUM(credit) - SUM(debit) per (account, currency).
// Account naming convention:
//   'hot_safe'      → hot operational safe
//   'cold_reserve'  → cold reserve safe
//   'user:<uuid>'   → individual user custody balance
import { and, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LedgerExpected {
  accountLabel: string;
  token: 'USDT' | 'USDC';
  /** Net balance in raw minor units (as bigint) */
  balanceMinor: bigint;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute ledger-expected balance for every (account, currency) pair
 * that appears in the given account labels list.
 *
 * Returns a Map keyed by `${accountLabel}:${token}` for O(1) lookups.
 * Accounts not present in ledger_entries return 0n.
 */
export async function computeLedgerExpected(
  db: Db,
  accountLabels: string[],
  tokens: Array<'USDT' | 'USDC'>
): Promise<Map<string, bigint>> {
  if (accountLabels.length === 0) return new Map();

  // Single aggregate query — avoids N+1 per address.
  // inArray generates parameterised ANY($1) — safe against SQL injection.
  const rows = await db
    .select({
      account: schema.ledgerEntries.account,
      currency: schema.ledgerEntries.currency,
      // SUM(credit - debit) gives net expected balance
      netMinor: sql<string>`SUM(${schema.ledgerEntries.credit} - ${schema.ledgerEntries.debit})`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        inArray(schema.ledgerEntries.account, accountLabels),
        inArray(schema.ledgerEntries.currency, tokens)
      )
    )
    .groupBy(schema.ledgerEntries.account, schema.ledgerEntries.currency);

  const result = new Map<string, bigint>();
  for (const row of rows) {
    const key = `${row.account}:${row.currency}`;
    // netMinor comes back as string from numeric aggregation
    const raw = row.netMinor ?? '0';
    // Convert decimal string (e.g. "1234.000000") to bigint minor units
    // Ledger stores 18-decimal amounts; we interpret as integer minor units
    const bigVal = parseDecimalToMinor(raw);
    result.set(key, bigVal);
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Convert a decimal string from Postgres numeric aggregation into a bigint.
 * Ledger amounts are stored with up to 18 decimal places in the `numeric` column.
 * For USDT/USDC on BNB (18 dec) and Solana (6 dec), the values in ledger are
 * already stored in minor units as integers, so we strip the decimal part.
 *
 * e.g. "1000000000000000000.000000000000000000" → 1000000000000000000n
 *      "1000000.000000" → 1000000n
 */
function parseDecimalToMinor(val: string): bigint {
  const dotIdx = val.indexOf('.');
  const intPart = dotIdx === -1 ? val : val.slice(0, dotIdx);
  // Handle negative values
  if (!intPart || intPart === '-') return 0n;
  try {
    return BigInt(intPart);
  } catch {
    return 0n;
  }
}
