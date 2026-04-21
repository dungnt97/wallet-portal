// reconciliation-balance-probe — thin re-export of wallet-engine balance-probe primitives.
// admin-api has ethers + @solana/web3.js already installed (same deps as wallet-engine),
// so we copy the probe functions inline here to avoid a cross-service HTTP call and to
// reuse the same Redis cache key format (`balance:<chain>:<addr>:<token>`).
//
// This file is intentionally minimal — all probe logic lives in the original source.
// If wallet-engine exposes a shared package in future, replace these with that import.
import { type Connection, PublicKey } from '@solana/web3.js';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import type IORedis from 'ioredis';

// ── Redis cache helpers (same key format as wallet-engine/balance-probe.ts) ───

const CACHE_TTL_BASE_S = 30;
const CACHE_JITTER_S = 3;

function cacheKey(chain: string, address: string, token: string): string {
  return `balance:${chain}:${address}:${token}`;
}

function ttlWithJitter(): number {
  const jitter = Math.floor(Math.random() * (2 * CACHE_JITTER_S + 1)) - CACHE_JITTER_S;
  return CACHE_TTL_BASE_S + jitter;
}

async function getCached(redis: IORedis, key: string): Promise<bigint | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function setCached(redis: IORedis, key: string, value: bigint): Promise<void> {
  await redis.set(key, value.toString(), 'EX', ttlWithJitter());
}

// ── EVM balance probe ─────────────────────────────────────────────────────────

const ERC20_IFACE = new Interface(['function balanceOf(address account) view returns (uint256)']);

export async function probeEvmBalance(
  redis: IORedis,
  rpcUrl: string,
  walletAddr: string,
  tokenAddr: string,
  cacheChain: string,
  tokenSymbol: string
): Promise<bigint> {
  const key = cacheKey(cacheChain, walletAddr, tokenSymbol);
  const cached = await getCached(redis, key);
  if (cached !== null) return cached;

  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  try {
    const contract = new Contract(tokenAddr, ERC20_IFACE, provider);
    const raw = (await contract.getFunction('balanceOf')(walletAddr)) as bigint;
    const result = typeof raw === 'bigint' ? raw : BigInt(String(raw));
    await setCached(redis, key, result);
    return result;
  } finally {
    provider.destroy();
  }
}

// ── Solana SPL balance probe ──────────────────────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export async function probeSolanaBalance(
  redis: IORedis,
  connection: Connection,
  walletAddr: string,
  mint: string,
  tokenSymbol: string
): Promise<bigint> {
  const key = cacheKey('sol', walletAddr, tokenSymbol);
  const cached = await getCached(redis, key);
  if (cached !== null) return cached;

  const ownerPk = new PublicKey(walletAddr);
  const mintPk = new PublicKey(mint);

  const resp = await connection.getTokenAccountsByOwner(ownerPk, {
    programId: TOKEN_PROGRAM_ID,
    mint: mintPk,
  });

  let total = 0n;
  for (const { account } of resp.value) {
    const data = account.data;
    if (data.length >= 72) {
      const lo = BigInt(data.readUInt32LE(64));
      const hi = BigInt(data.readUInt32LE(68));
      total += lo + (hi << 32n);
    }
  }

  await setCached(redis, key, total);
  return total;
}
