import type { Connection } from '@solana/web3.js';
// Gas history sampler — probes BNB + Solana gas every 5 min,
// stores results in Redis sorted sets keyed by timestamp.
//
// Redis keys:
//   gas:bnb  — ZADD score=epoch_ms, value=JSON{ts,price}
//   gas:sol  — ZADD score=epoch_ms, value=JSON{ts,price}
//
// TTL strategy: ZREMRANGEBYSCORE removes entries older than 48h after each write.
// This keeps sets bounded without a separate cron.
import type { FallbackProvider } from 'ethers';
import type IORedis from 'ioredis';
import pino from 'pino';
import { probeBnbGas, probeSolanaGas } from './gas-probe.js';

const logger = pino({ name: 'gas-sampler' });

export const GAS_KEY_BNB = 'gas:bnb';
export const GAS_KEY_SOL = 'gas:sol';

/** How long to retain samples in Redis (48 h in ms) */
const RETENTION_MS = 48 * 60 * 60 * 1_000;
/** Probe interval (5 min in ms) */
const INTERVAL_MS = 5 * 60 * 1_000;

export interface GasSample {
  ts: string; // ISO-8601
  price: number;
}

/** Write one sample to a Redis sorted set and prune entries older than 48h. */
async function writeSample(redis: IORedis, key: string, price: number): Promise<void> {
  const now = Date.now();
  const sample: GasSample = { ts: new Date(now).toISOString(), price };
  const cutoff = now - RETENTION_MS;

  // Pipeline: write + prune atomically
  const pipe = redis.pipeline();
  pipe.zadd(key, now, JSON.stringify(sample));
  pipe.zremrangebyscore(key, '-inf', cutoff);
  await pipe.exec();
}

/** Run one probe cycle: attempt both chains, log failures non-fatally. */
async function runSample(
  provider: FallbackProvider,
  solConn: Connection,
  redis: IORedis
): Promise<void> {
  const results = await Promise.allSettled([probeBnbGas(provider), probeSolanaGas(solConn)]);

  const [bnbResult, solResult] = results;

  if (bnbResult.status === 'fulfilled') {
    await writeSample(redis, GAS_KEY_BNB, bnbResult.value).catch((err) =>
      logger.error({ err }, 'Failed to write BNB gas sample to Redis')
    );
    logger.info({ gwei: bnbResult.value }, 'BNB gas sampled');
  } else {
    logger.warn({ err: bnbResult.reason }, 'BNB gas probe failed — skipping sample');
  }

  if (solResult.status === 'fulfilled') {
    await writeSample(redis, GAS_KEY_SOL, solResult.value).catch((err) =>
      logger.error({ err }, 'Failed to write Solana gas sample to Redis')
    );
    logger.info({ solPerSig: solResult.value }, 'Solana gas sampled');
  } else {
    logger.warn({ err: solResult.reason }, 'Solana gas probe failed — skipping sample');
  }
}

/**
 * Start the gas history sampler.
 * - Fires one immediate probe on boot.
 * - Then repeats every INTERVAL_MS (5 min).
 * Returns a stop function for graceful shutdown.
 */
export function startGasSampler(
  provider: FallbackProvider,
  solConn: Connection,
  redis: IORedis
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  // Immediate boot probe — non-blocking, errors only logged
  runSample(provider, solConn, redis).catch((err) => logger.error({ err }, 'Boot gas probe error'));

  timer = setInterval(() => {
    if (stopped) return;
    runSample(provider, solConn, redis).catch((err) =>
      logger.error({ err }, 'Periodic gas probe error')
    );
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS }, 'Gas history sampler started');

  return () => {
    stopped = true;
    if (timer !== null) clearInterval(timer);
    logger.info('Gas history sampler stopped');
  };
}
