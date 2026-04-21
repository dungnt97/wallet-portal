// Wallet Engine entry point — starts Fastify health server, RPC pools, block watchers
// OTel MUST be imported first — instruments pg, ioredis, HTTP before any other require
import './telemetry/otel.js';
import 'dotenv/config';
import { trace } from '@opentelemetry/api';
import Fastify from 'fastify';
import pino from 'pino';
import { bnbRpcUrls, loadConfig, solanaRpcUrls } from './config/env.js';
import { makeDb } from './db/client.js';
import { closeRedisConnection, getRedisConnection } from './queue/connection.js';
import { makeDepositConfirmQueue } from './queue/deposit-confirm.js';
import { makeSweepExecuteQueue } from './queue/sweep-execute.js';
import { makeWithdrawalExecuteQueue } from './queue/withdrawal-execute.js';
import { startDepositConfirmWorker } from './queue/workers/deposit-confirm-worker.js';
import { startSweepExecuteWorker } from './queue/workers/sweep-execute-worker.js';
import { startWithdrawalExecuteWorker } from './queue/workers/withdrawal-execute-worker.js';
import { destroyBnbPool, makeBnbPool } from './rpc/bnb-pool.js';
import { destroySolanaPool, makeSolanaPool, solanaCall } from './rpc/solana-pool.js';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  registry as metricsRegistry,
} from './telemetry/metrics.js';
import { initSentry } from './telemetry/sentry.js';
import { startAddressRegistry } from './watcher/address-registry.js';
import { startBnbWatcher } from './watcher/bnb-watcher.js';
import { detectBnbDeposits } from './watcher/deposit-detector.js';
import { startSolanaWatcher } from './watcher/solana-watcher.js';

// Pino logger with OTel trace context injection
function makeLogger(level: string) {
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  return pino({
    name: 'wallet-engine',
    level,
    // Inject active OTel span IDs into every log record
    formatters: {
      log(obj: Record<string, unknown>) {
        const span = trace.getActiveSpan();
        if (span) {
          const ctx = span.spanContext();
          return { ...obj, trace_id: ctx.traceId, span_id: ctx.spanId };
        }
        return obj;
      },
    },
    ...(isDev && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  });
}

async function start(): Promise<void> {
  const cfg = loadConfig();
  initSentry();

  const logger = makeLogger(cfg.LOG_LEVEL);

  // --- Fastify health server ---
  const fastify = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      ...((process.env.NODE_ENV ?? 'development') !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
  });

  // --- Infrastructure ---
  const db = makeDb(cfg.DATABASE_URL);
  const redis = getRedisConnection(cfg.REDIS_URL);
  const depositQueue = makeDepositConfirmQueue(redis);
  const withdrawalExecuteQueue = makeWithdrawalExecuteQueue(redis);
  const sweepExecuteQueue = makeSweepExecuteQueue(redis);

  // ── Health endpoints ──────────────────────────────────────────────────────
  fastify.get('/health', async () => ({ status: 'ok' }));
  fastify.get('/health/live', async () => ({ status: 'ok' }));
  fastify.get('/health/ready', async (_req, reply) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';

    try {
      // Lightweight DB ping — select 1
      await db.execute('select 1' as unknown as Parameters<typeof db.execute>[0]);
    } catch {
      dbStatus = 'error';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'error';
    }

    const degraded = dbStatus === 'error' || redisStatus === 'error';
    return reply.code(degraded ? 503 : 200).send({
      status: degraded ? 'degraded' : 'ok',
      db: dbStatus,
      redis: redisStatus,
    });
  });

  // ── Prometheus /metrics endpoint ──────────────────────────────────────────
  fastify.get('/metrics', async (_req, reply) => {
    const body = await metricsRegistry.metrics();
    return reply.code(200).header('Content-Type', metricsRegistry.contentType).send(body);
  });

  // ── HTTP instrumentation hooks ────────────────────────────────────────────
  fastify.addHook('onRequest', async (request) => {
    (request as typeof request & { _startTime: number })._startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const start = (request as typeof request & { _startTime: number })._startTime ?? Date.now();
    const durationSec = (Date.now() - start) / 1000;
    const route = request.routeOptions?.url ?? request.url;
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
  });

  // --- RPC pools ---
  const bnbPool = makeBnbPool(bnbRpcUrls(cfg));
  const solPool = makeSolanaPool(solanaRpcUrls(cfg));

  // Verify connectivity and log latest block/slot
  try {
    const bnbBlock = await bnbPool.provider.getBlockNumber();
    logger.info({ block: bnbBlock }, 'BNB connected, latest block');
  } catch (err) {
    logger.warn({ err }, 'BNB RPC connection degraded — continuing (skeleton mode)');
  }

  try {
    const slot = await solanaCall(solPool, (c) => c.getSlot());
    logger.info({ slot }, 'Solana connected, latest slot');
  } catch (err) {
    logger.warn({ err }, 'Solana RPC connection degraded — continuing (skeleton mode)');
  }

  // --- Address registry ---
  const { registry, stop: stopRegistry } = await startAddressRegistry(db);
  logger.info({ bnb: registry.bnb.size, sol: registry.sol.size }, 'Loaded watched addresses');

  // --- BNB block watcher ---
  let lastBnbBlock = -1;
  const bnbWatcher = startBnbWatcher(bnbPool.provider, async (blockNumber) => {
    const fromBlock = lastBnbBlock < 0 ? blockNumber : lastBnbBlock + 1;
    lastBnbBlock = blockNumber;
    await detectBnbDeposits(
      bnbPool.provider,
      db,
      depositQueue,
      fromBlock,
      blockNumber,
      registry.bnb,
      cfg.USDT_BNB_ADDRESS,
      cfg.USDC_BNB_ADDRESS
    );
  });

  // --- Solana slot watcher (skeleton — full SPL parsing in Phase 09) ---
  const solWatcher = startSolanaWatcher(solPool.primary, async (slot) => {
    logger.debug({ slot }, 'Solana slot — SPL deposit scanning deferred to Phase 09');
  });

  // --- Start HTTP server ---
  await fastify.listen({ port: cfg.PORT, host: '0.0.0.0' });
  logger.info(`listening :${cfg.PORT}`);

  // --- Start BullMQ deposit confirm worker ---
  const depositWorker = startDepositConfirmWorker(redis, cfg);
  logger.info('deposit_confirm worker started');

  // --- Start BullMQ withdrawal execute worker ---
  const withdrawalExecuteWorker = startWithdrawalExecuteWorker(redis, cfg);
  logger.info('withdrawal_execute worker started');

  // --- Start BullMQ sweep execute worker ---
  const sweepWorker = startSweepExecuteWorker(redis, cfg, { bnbPool, solPool });
  logger.info('sweep_execute worker started');

  // --- Graceful shutdown ---
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal — closing wallet-engine');
    bnbWatcher.stop();
    await solWatcher.stop();
    stopRegistry();
    await depositWorker.close();
    await withdrawalExecuteWorker.close();
    await sweepWorker.close();
    await depositQueue.close();
    await withdrawalExecuteQueue.close();
    await sweepExecuteQueue.close();
    await closeRedisConnection();
    await destroyBnbPool(bnbPool);
    await destroySolanaPool(solPool);
    await fastify.close();
    logger.info('Wallet engine shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start().catch((err) => {
  // Use pino directly here since logger is scoped inside start()
  pino({ name: 'wallet-engine' }).error({ err }, 'Fatal startup error');
  process.exit(1);
});
