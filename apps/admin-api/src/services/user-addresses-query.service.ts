// User addresses query — list user_addresses rows and attach Redis-cached on-chain balance.
// Cache keys written by wallet-engine balance-probe (Slice 7): balance:<chain>:<address>:<token>
// Cache miss → returns null balance with cached:false; UI shows "—".
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface AddressWithBalance {
  id: string;
  userId: string;
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string | null;
  derivationIndex: number;
  tier: 'hot' | 'cold';
  createdAt: string;
  balance: { USDT: string | null; USDC: string | null } | null;
  /** false when Redis keys not yet populated by balance-probe */
  cached: boolean;
}

/** Redis key pattern used by wallet-engine Slice 7 balance-probe */
function balanceCacheKey(chain: string, address: string, token: string): string {
  return `balance:${chain}:${address}:${token}`;
}

/**
 * List all addresses for a user with cached on-chain balances from Redis.
 * On Redis miss, balance is null and cached=false.
 */
export async function getUserAddresses(
  db: Db,
  redis: Redis,
  userId: string
): Promise<AddressWithBalance[]> {
  const rows = await db
    .select()
    .from(schema.userAddresses)
    .where(eq(schema.userAddresses.userId, userId))
    .orderBy(schema.userAddresses.chain);

  return Promise.all(
    rows.map(async (row) => {
      const usdtKey = balanceCacheKey(row.chain, row.address, 'USDT');
      const usdcKey = balanceCacheKey(row.chain, row.address, 'USDC');

      let usdtVal: string | null = null;
      let usdcVal: string | null = null;
      let cached = false;

      try {
        const mgetResult = await redis.mget(usdtKey, usdcKey);
        usdtVal = mgetResult[0] ?? null;
        usdcVal = mgetResult[1] ?? null;
        // cached=true only if at least one key exists in Redis
        cached = usdtVal !== null || usdcVal !== null;
      } catch {
        // Redis error → treat as cache miss, do not throw
        cached = false;
      }

      return {
        id: row.id,
        userId: row.userId,
        chain: row.chain,
        address: row.address,
        derivationPath: row.derivationPath ?? null,
        derivationIndex: row.derivationIndex,
        tier: row.tier,
        createdAt: row.createdAt.toISOString(),
        balance: cached ? { USDT: usdtVal, USDC: usdcVal } : null,
        cached,
      };
    })
  );
}
