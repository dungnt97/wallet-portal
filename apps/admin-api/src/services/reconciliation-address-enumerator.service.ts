// reconciliation-address-enumerator.service — builds the list of (chain, token, address, label)
// tuples that should be probed during a reconciliation snapshot.
//
// Sources:
//   - Hot safes:   wallets WHERE purpose='operational'
//   - Cold safes:  wallets WHERE purpose='cold_reserve'
//   - Users:       user_addresses (all active HD deposit addresses)
//
// Tokens: USDT + USDC only (stablecoins). Native gas balances are out of scope.
import { and, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { SnapshotScope } from '../db/schema/reconciliation-snapshots.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ManagedAddress {
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  address: string;
  /** Ledger account identifier matching ledger_entries.account */
  accountLabel: string;
  addressScope: 'hot' | 'cold' | 'user';
}

const TOKENS: Array<'USDT' | 'USDC'> = ['USDT', 'USDC'];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Enumerate all managed addresses for the given scope, frozen at snapshotCreatedAt.
 * Returns a flat list of (chain, token, address, accountLabel) for every combination.
 */
export async function enumerateManagedAddresses(
  db: Db,
  scope: SnapshotScope,
  chainFilter: string | null | undefined,
  snapshotCreatedAt: Date
): Promise<ManagedAddress[]> {
  const results: ManagedAddress[] = [];

  // ── Hot safes ────────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'hot') {
    const hotWallets = await db
      .select({ chain: schema.wallets.chain, address: schema.wallets.address })
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.purpose, 'operational'),
          chainFilter ? eq(schema.wallets.chain, chainFilter as 'bnb' | 'sol') : undefined,
          lte(schema.wallets.createdAt, snapshotCreatedAt)
        )
      );

    for (const w of hotWallets) {
      for (const token of TOKENS) {
        results.push({
          chain: w.chain,
          token,
          address: w.address,
          accountLabel: 'hot_safe',
          addressScope: 'hot',
        });
      }
    }
  }

  // ── Cold safes ───────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'cold') {
    const coldWallets = await db
      .select({ chain: schema.wallets.chain, address: schema.wallets.address })
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.purpose, 'cold_reserve'),
          chainFilter ? eq(schema.wallets.chain, chainFilter as 'bnb' | 'sol') : undefined,
          lte(schema.wallets.createdAt, snapshotCreatedAt)
        )
      );

    for (const w of coldWallets) {
      for (const token of TOKENS) {
        results.push({
          chain: w.chain,
          token,
          address: w.address,
          accountLabel: 'cold_reserve',
          addressScope: 'cold',
        });
      }
    }
  }

  // ── User HD deposit addresses ─────────────────────────────────────────────────
  if (scope === 'all' || scope === 'users') {
    const userAddrs = await db
      .select({
        userId: schema.userAddresses.userId,
        chain: schema.userAddresses.chain,
        address: schema.userAddresses.address,
      })
      .from(schema.userAddresses)
      .where(
        and(
          chainFilter ? eq(schema.userAddresses.chain, chainFilter as 'bnb' | 'sol') : undefined,
          lte(schema.userAddresses.createdAt, snapshotCreatedAt)
        )
      );

    for (const ua of userAddrs) {
      for (const token of TOKENS) {
        results.push({
          chain: ua.chain,
          token,
          address: ua.address,
          accountLabel: `user:${ua.userId}`,
          addressScope: 'user',
        });
      }
    }
  }

  return results;
}
