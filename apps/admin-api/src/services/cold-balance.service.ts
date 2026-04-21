import { Connection, PublicKey } from '@solana/web3.js';
import { and, eq } from 'drizzle-orm';
// Cold balance service — probes ERC-20 / SPL balances for hot+cold wallets.
// Uses ethers.js (EVM) and @solana/web3.js (Solana) directly; results cached in Redis 30s ±3s.
//
// Returns 4 cards: bnb-hot, bnb-cold, sol-hot, sol-cold × {USDT, USDC} = 8 rows.
// Each probe runs in parallel via Promise.allSettled; per-chain errors surface as stale=true.
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import type IORedis from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BalanceEntry {
  chain: 'bnb' | 'sol';
  tier: 'hot' | 'cold';
  address: string;
  token: 'USDT' | 'USDC';
  /** Raw integer string (18-decimal for BNB, 6-decimal for Solana SPL) */
  balance: string;
  lastCheckedAt: string; // ISO-8601
  /** true when the value is served from stale cache due to RPC error */
  stale?: boolean;
}

export interface BalanceProbeConfig {
  rpcBnb: string;
  rpcSolana: string;
  usdtBnbAddr: string;
  usdcBnbAddr: string;
  usdtSolMint: string;
  usdcSolMint: string;
}

// ── Redis cache helpers ───────────────────────────────────────────────────────

const CACHE_TTL_BASE_S = 30;
const CACHE_JITTER_S = 3;

function cacheKey(chain: string, address: string, token: string): string {
  return `balance:${chain}:${address}:${token}`;
}

function ttlWithJitter(): number {
  const jitter = Math.floor(Math.random() * (2 * CACHE_JITTER_S + 1)) - CACHE_JITTER_S;
  return CACHE_TTL_BASE_S + jitter;
}

interface CachedBalance {
  balance: string;
  lastCheckedAt: string;
}

async function getCached(redis: IORedis, key: string): Promise<CachedBalance | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedBalance;
  } catch {
    return null;
  }
}

async function setCached(redis: IORedis, key: string, value: CachedBalance): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlWithJitter());
}

// ── EVM balance probe ─────────────────────────────────────────────────────────

const ERC20_IFACE = new Interface(['function balanceOf(address account) view returns (uint256)']);

async function probeEvmBalance(
  redis: IORedis,
  rpcUrl: string,
  walletAddr: string,
  tokenAddr: string,
  chain: 'bnb',
  tokenSymbol: 'USDT' | 'USDC'
): Promise<{ balance: string; lastCheckedAt: string; stale?: boolean }> {
  const key = cacheKey(chain, walletAddr, tokenSymbol);
  const cached = await getCached(redis, key);
  if (cached) return cached;

  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  try {
    const contract = new Contract(tokenAddr, ERC20_IFACE, provider);
    // ethers Contract.getFunction gives a typed ContractMethod; avoids index-signature undefined
    const raw = (await contract.getFunction('balanceOf')(walletAddr)) as bigint;
    const result: CachedBalance = {
      balance: (typeof raw === 'bigint' ? raw : BigInt(String(raw))).toString(),
      lastCheckedAt: new Date().toISOString(),
    };
    await setCached(redis, key, result);
    return result;
  } finally {
    provider.destroy();
  }
}

// ── Solana SPL balance probe ──────────────────────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function probeSolanaBalance(
  redis: IORedis,
  rpcUrl: string,
  walletAddr: string,
  mint: string,
  tokenSymbol: 'USDT' | 'USDC'
): Promise<{ balance: string; lastCheckedAt: string; stale?: boolean }> {
  const key = cacheKey('sol', walletAddr, tokenSymbol);
  const cached = await getCached(redis, key);
  if (cached) return cached;

  const connection = new Connection(rpcUrl, 'confirmed');
  const ownerPk = new PublicKey(walletAddr);
  const mintPk = new PublicKey(mint);

  const resp = await connection.getTokenAccountsByOwner(ownerPk, {
    programId: TOKEN_PROGRAM_ID,
    mint: mintPk,
  });

  let total = 0n;
  for (const { account } of resp.value) {
    const data = account.data as Buffer;
    // SPL token account layout: amount is u64 LE at byte offset 64
    if (data.length >= 72) {
      const lo = BigInt(data.readUInt32LE(64));
      const hi = BigInt(data.readUInt32LE(68));
      total += lo + (hi << 32n);
    }
  }

  const result: CachedBalance = {
    balance: total.toString(),
    lastCheckedAt: new Date().toISOString(),
  };
  await setCached(redis, key, result);
  return result;
}

// ── Wallet address resolver ───────────────────────────────────────────────────

interface WalletAddresses {
  bnbHot: string;
  bnbCold: string;
  solHot: string;
  solCold: string;
}

async function resolveWalletAddresses(db: Db): Promise<WalletAddresses> {
  const walletRows = await db
    .select({
      chain: schema.wallets.chain,
      tier: schema.wallets.tier,
      address: schema.wallets.address,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.purpose, 'cold_reserve')));

  // Also fetch hot operational wallets
  const hotRows = await db
    .select({
      chain: schema.wallets.chain,
      tier: schema.wallets.tier,
      address: schema.wallets.address,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.purpose, 'operational')));

  const all = [...walletRows, ...hotRows];

  const find = (chain: 'bnb' | 'sol', tier: 'hot' | 'cold'): string => {
    const row = all.find((r) => r.chain === chain && r.tier === tier);
    return row?.address ?? '';
  };

  return {
    bnbHot: find('bnb', 'hot'),
    bnbCold: find('bnb', 'cold'),
    solHot: find('sol', 'hot'),
    solCold: find('sol', 'cold'),
  };
}

// ── Main service function ─────────────────────────────────────────────────────

/**
 * Probe all 8 balance slots (4 wallets × 2 tokens) in parallel.
 * Promise.allSettled ensures per-probe errors surface as stale entries rather than
 * failing the entire response.
 */
export async function getColdBalances(
  db: Db,
  redis: IORedis,
  cfg: BalanceProbeConfig
): Promise<BalanceEntry[]> {
  const addrs = await resolveWalletAddresses(db);

  // Build probe tasks: [chain, tier, address, token, tokenAddr/mint]
  type ProbeTask = {
    chain: 'bnb' | 'sol';
    tier: 'hot' | 'cold';
    address: string;
    token: 'USDT' | 'USDC';
    tokenRef: string; // contract addr (BNB) or mint (SOL)
  };

  const tasks: ProbeTask[] = (
    [
      {
        chain: 'bnb' as const,
        tier: 'hot' as const,
        address: addrs.bnbHot,
        token: 'USDT' as const,
        tokenRef: cfg.usdtBnbAddr,
      },
      {
        chain: 'bnb' as const,
        tier: 'hot' as const,
        address: addrs.bnbHot,
        token: 'USDC' as const,
        tokenRef: cfg.usdcBnbAddr,
      },
      {
        chain: 'bnb' as const,
        tier: 'cold' as const,
        address: addrs.bnbCold,
        token: 'USDT' as const,
        tokenRef: cfg.usdtBnbAddr,
      },
      {
        chain: 'bnb' as const,
        tier: 'cold' as const,
        address: addrs.bnbCold,
        token: 'USDC' as const,
        tokenRef: cfg.usdcBnbAddr,
      },
      {
        chain: 'sol' as const,
        tier: 'hot' as const,
        address: addrs.solHot,
        token: 'USDT' as const,
        tokenRef: cfg.usdtSolMint,
      },
      {
        chain: 'sol' as const,
        tier: 'hot' as const,
        address: addrs.solHot,
        token: 'USDC' as const,
        tokenRef: cfg.usdcSolMint,
      },
      {
        chain: 'sol' as const,
        tier: 'cold' as const,
        address: addrs.solCold,
        token: 'USDT' as const,
        tokenRef: cfg.usdtSolMint,
      },
      {
        chain: 'sol' as const,
        tier: 'cold' as const,
        address: addrs.solCold,
        token: 'USDC' as const,
        tokenRef: cfg.usdcSolMint,
      },
    ] satisfies ProbeTask[]
  ).filter((t) => t.address !== '');

  const probePromises = tasks.map(async (t) => {
    if (t.chain === 'bnb') {
      return probeEvmBalance(redis, cfg.rpcBnb, t.address, t.tokenRef, t.chain, t.token);
    }
    return probeSolanaBalance(redis, cfg.rpcSolana, t.address, t.tokenRef, t.token);
  });

  const results = await Promise.allSettled(probePromises);

  return tasks.map((t, i): BalanceEntry => {
    const result = results[i];
    if (!result)
      return {
        chain: t.chain,
        tier: t.tier,
        address: t.address,
        token: t.token,
        balance: '0',
        lastCheckedAt: new Date().toISOString(),
        stale: true,
      };
    if (result.status === 'fulfilled') {
      const entry: BalanceEntry = {
        chain: t.chain,
        tier: t.tier,
        address: t.address,
        token: t.token,
        balance: result.value.balance,
        lastCheckedAt: result.value.lastCheckedAt,
      };
      if (result.value.stale) entry.stale = true;
      return entry;
    }
    // Probe failed — return stale entry with zero balance
    return {
      chain: t.chain,
      tier: t.tier,
      address: t.address,
      token: t.token,
      balance: '0',
      lastCheckedAt: new Date().toISOString(),
      stale: true,
    };
  });
}
