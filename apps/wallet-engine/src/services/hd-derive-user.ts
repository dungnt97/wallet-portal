import * as schema from '@wp/admin-api/db-schema';
// HD address derivation for a user — wraps bnb-derive + solana-derive with advisory lock.
// Advisory lock per chain ensures serialized index allocation under concurrent requests.
// Idempotent: if (user_id, chain) address already exists, skip derivation and return existing.
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { deriveBnbAddress } from '../hd/bnb-derive.js';
import { deriveSolanaAddress } from '../hd/solana-derive.js';

export interface DerivedAddressResult {
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string;
  derivationIndex: number;
}

export interface DeriveUserAddressesResult {
  addresses: DerivedAddressResult[];
}

const CHAINS: Array<'bnb' | 'sol'> = ['bnb', 'sol'];
/** Maximum retries on unique-index conflict for derivation_index */
const MAX_RETRIES = 3;

/**
 * Derive BNB + Solana addresses for a user using per-chain advisory locks.
 * Uses pg_advisory_xact_lock(hashtext(...)) to serialize index allocation per chain.
 * Idempotent: existing (user_id, chain) rows are returned as-is without new derivation.
 */
export async function deriveUserAddresses(
  db: Db,
  userId: string,
  mnemonic: string,
  seedHex: string
): Promise<DeriveUserAddressesResult> {
  const results: DerivedAddressResult[] = [];

  for (const chain of CHAINS) {
    const result = await deriveForChain(db, userId, chain, mnemonic, seedHex);
    results.push(result);
  }

  return { addresses: results };
}

async function deriveForChain(
  db: Db,
  userId: string,
  chain: 'bnb' | 'sol',
  mnemonic: string,
  seedHex: string
): Promise<DerivedAddressResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // Advisory lock — serialises index allocation for this chain across concurrent tx
        // hashtext is Postgres-native, returns int4 from a string key
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`user_addresses:${chain}`}))`);

        // Idempotency check: return existing if already derived for this user + chain
        const existing = await tx
          .select()
          .from(schema.userAddresses)
          .where(
            sql`${schema.userAddresses.userId} = ${userId} AND ${schema.userAddresses.chain} = ${chain}`
          )
          .limit(1);

        const existingRow = existing[0];
        if (existingRow) {
          return {
            chain: existingRow.chain,
            address: existingRow.address,
            derivationPath: existingRow.derivationPath ?? '',
            derivationIndex: existingRow.derivationIndex,
          };
        }

        // Allocate next index: MAX(derivation_index) + 1 across all users for this chain
        const maxRow = await tx
          .select({ maxIdx: sql<number | null>`MAX(${schema.userAddresses.derivationIndex})` })
          .from(schema.userAddresses)
          .where(eq(schema.userAddresses.chain, chain));

        const nextIndex = (maxRow[0]?.maxIdx ?? -1) + 1;

        // Derive address from HD seed
        const { address, path } =
          chain === 'bnb'
            ? deriveBnbAddress(mnemonic, nextIndex)
            : deriveSolanaAddress(seedHex, nextIndex);

        // Insert — unique index (chain, derivation_index) guards against races
        await tx.insert(schema.userAddresses).values({
          userId,
          chain,
          address,
          derivationPath: path,
          derivationIndex: nextIndex,
          tier: 'hot',
        });

        return { chain, address, derivationPath: path, derivationIndex: nextIndex };
      });
    } catch (err: unknown) {
      // Postgres unique violation on (chain, derivation_index) — retry with next index
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505' && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  // Should be unreachable after MAX_RETRIES — rethrow last error
  throw new Error(
    `Failed to derive ${chain} address for user ${userId} after ${MAX_RETRIES} attempts`
  );
}
