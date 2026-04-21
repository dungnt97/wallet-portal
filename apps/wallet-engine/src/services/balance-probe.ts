import { type Connection, PublicKey } from '@solana/web3.js';
// Balance probe — reads ERC-20 / SPL token balances for cold + hot wallets.
// Results are cached in Redis with a 30s TTL + ±3s jitter to avoid thundering herd.
//
// EVM: ethers.js Contract.balanceOf (already a dep — no new pkg needed)
// Solana: @solana/web3.js getTokenAccountsByOwner (already a dep)
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'balance-probe' });

// ── Redis cache helpers ────────────────────────────────────────────────────────

const CACHE_TTL_BASE_S = 30;
const CACHE_JITTER_S = 3;

function cacheKey(chain: string, address: string, token: string): string {
  return `balance:${chain}:${address}:${token}`;
}

/** TTL with ±3s jitter to spread Redis expiry across probes */
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

// ── ERC-20 ABI (minimal) ──────────────────────────────────────────────────────

const ERC20_IFACE = new Interface(['function balanceOf(address account) view returns (uint256)']);

// ── EVM probe ─────────────────────────────────────────────────────────────────

/**
 * Read ERC-20 balanceOf for walletAddr on the given RPC endpoint.
 * tokenAddr = address('0x0') means native BNB — not used here, only ERC-20 stables.
 * Returns balance in smallest unit (18 decimals for BNB USDT/USDC).
 */
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
  if (cached !== null) {
    logger.debug({ walletAddr, tokenSymbol, cacheChain }, 'balance cache hit');
    return cached;
  }

  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  try {
    const contract = new Contract(tokenAddr, ERC20_IFACE, provider);
    const raw = (await contract.getFunction('balanceOf')(walletAddr)) as bigint;
    const result = typeof raw === 'bigint' ? raw : BigInt(String(raw));
    await setCached(redis, key, result);
    logger.debug(
      { walletAddr, tokenSymbol, cacheChain, result: result.toString() },
      'EVM balance fetched'
    );
    return result;
  } finally {
    // ethers JsonRpcProvider: destroy to release socket
    provider.destroy();
  }
}

// ── Solana SPL token probe ────────────────────────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Sum all SPL token accounts owned by walletAddr for the given mint.
 * Handles wallets with multiple ATAs (edge case — cold wallets typically have one).
 * Returns balance as bigint in the token's raw integer (lamport) unit.
 */
export async function probeSolanaBalance(
  redis: IORedis,
  connection: Connection,
  walletAddr: string,
  mint: string,
  tokenSymbol: string
): Promise<bigint> {
  const key = cacheKey('sol', walletAddr, tokenSymbol);
  const cached = await getCached(redis, key);
  if (cached !== null) {
    logger.debug({ walletAddr, tokenSymbol }, 'Solana balance cache hit');
    return cached;
  }

  const ownerPk = new PublicKey(walletAddr);
  const mintPk = new PublicKey(mint);

  const resp = await connection.getTokenAccountsByOwner(ownerPk, {
    programId: TOKEN_PROGRAM_ID,
    mint: mintPk,
  });

  let total = 0n;
  for (const { account } of resp.value) {
    // account.data is a Buffer; uiAmount from parsed data not guaranteed — read raw amount
    // Layout: [72 bytes header] mint(32) owner(32) amount(8 LE) ...
    // Offset 64 = amount u64 LE per SPL token account layout
    const data = account.data;
    if (data.length >= 72) {
      const amountBuf = data.subarray(64, 72);
      const lo = BigInt(amountBuf.readUInt32LE(0));
      const hi = BigInt(amountBuf.readUInt32LE(4));
      total += lo + (hi << 32n);
    }
  }

  await setCached(redis, key, total);
  logger.debug({ walletAddr, tokenSymbol, total: total.toString() }, 'Solana balance fetched');
  return total;
}
