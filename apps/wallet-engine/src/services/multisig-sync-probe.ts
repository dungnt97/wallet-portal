// Multisig sync probe — checks live RPC reachability for BNB Safe nonce + Solana Squads PDA.
// Results cached in Redis for 60s (busted by POST /internal/multisig/sync-refresh).
//
// BNB: reads nonce() from the Gnosis Safe contract via ethers FallbackProvider.
// SOL: checks whether the Squads multisig PDA account exists via getAccountInfo.
// If RPC fails → status='error'. If lastSyncAt > 5 min ago (cache miss path) → status='stale'.
import { type Connection, PublicKey } from '@solana/web3.js';
import { type FallbackProvider, Interface } from 'ethers';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'multisig-sync-probe' });

export type SyncStatus = 'synced' | 'stale' | 'error';

export interface ChainSyncResult {
  status: SyncStatus;
  lastSyncAt: string; // ISO-8601
  nonce?: number; // BNB only
}

export interface MultisigSyncStatus {
  bnb: ChainSyncResult;
  sol: ChainSyncResult;
}

// ── Redis cache keys ──────────────────────────────────────────────────────────

const CACHE_KEY_BNB = 'multisig:sync:bnb';
const CACHE_KEY_SOL = 'multisig:sync:sol';
const CACHE_TTL_S = 60;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── EVM Safe ABI (minimal — nonce() only) ────────────────────────────────────

const SAFE_IFACE = new Interface(['function nonce() view returns (uint256)']);

// ── Probe BNB Safe ─────────────────────────────────────────────────────────────

async function probeBnbSafe(
  provider: FallbackProvider,
  safeAddress: string
): Promise<ChainSyncResult> {
  try {
    const contract = new (await import('ethers')).Contract(safeAddress, SAFE_IFACE, provider);
    const nonce = (await contract.getFunction('nonce')()) as bigint;
    return {
      status: 'synced',
      lastSyncAt: new Date().toISOString(),
      nonce: Number(nonce),
    };
  } catch (err) {
    logger.warn({ err, safeAddress }, 'BNB Safe nonce probe failed');
    return { status: 'error', lastSyncAt: new Date().toISOString() };
  }
}

// ── Probe Solana Squads PDA ────────────────────────────────────────────────────

async function probeSolanaPda(
  connection: Connection,
  multisigPda: string
): Promise<ChainSyncResult> {
  try {
    const pk = new PublicKey(multisigPda);
    const info = await connection.getAccountInfo(pk);
    if (info === null) {
      // Account not found — treat as error (PDA may not be initialised yet)
      logger.warn({ multisigPda }, 'Squads PDA account not found');
      return { status: 'error', lastSyncAt: new Date().toISOString() };
    }
    return { status: 'synced', lastSyncAt: new Date().toISOString() };
  } catch (err) {
    logger.warn({ err, multisigPda }, 'Solana Squads PDA probe failed');
    return { status: 'error', lastSyncAt: new Date().toISOString() };
  }
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getCached(redis: IORedis, key: string): Promise<ChainSyncResult | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChainSyncResult;
  } catch {
    return null;
  }
}

async function setCached(redis: IORedis, key: string, value: ChainSyncResult): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_S);
}

/** Mark a cached result as stale if lastSyncAt is older than STALE_THRESHOLD_MS */
function maybeMarkStale(result: ChainSyncResult): ChainSyncResult {
  if (result.status === 'error') return result;
  const age = Date.now() - new Date(result.lastSyncAt).getTime();
  if (age > STALE_THRESHOLD_MS) {
    return { ...result, status: 'stale' };
  }
  return result;
}

// ── Main exported function ────────────────────────────────────────────────────

export interface SyncProbeConfig {
  bnbProvider: FallbackProvider;
  solanaConnection: Connection;
  safeAddress: string; // BNB Gnosis Safe contract address
  squadsPda: string; // Solana Squads multisig PDA address
}

/**
 * Get multisig sync status, using Redis cache (60s TTL).
 * Set bustCache=true to skip cache read and re-probe immediately.
 */
export async function getMultisigSyncStatus(
  redis: IORedis,
  cfg: SyncProbeConfig,
  bustCache = false
): Promise<MultisigSyncStatus> {
  const [bnbCached, solCached] = await Promise.all([
    bustCache ? null : getCached(redis, CACHE_KEY_BNB),
    bustCache ? null : getCached(redis, CACHE_KEY_SOL),
  ]);

  const [bnbResult, solResult] = await Promise.all([
    bnbCached ? maybeMarkStale(bnbCached) : probeBnbSafe(cfg.bnbProvider, cfg.safeAddress),
    solCached ? maybeMarkStale(solCached) : probeSolanaPda(cfg.solanaConnection, cfg.squadsPda),
  ]);

  // Persist fresh probes to cache
  if (!bnbCached || bustCache) {
    await setCached(redis, CACHE_KEY_BNB, bnbResult).catch((err) =>
      logger.warn({ err }, 'Failed to cache BNB sync result')
    );
  }
  if (!solCached || bustCache) {
    await setCached(redis, CACHE_KEY_SOL, solResult).catch((err) =>
      logger.warn({ err }, 'Failed to cache SOL sync result')
    );
  }

  return { bnb: bnbResult, sol: solResult };
}
