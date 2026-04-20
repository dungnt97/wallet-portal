// Wallet Engine entry point — starts Fastify health server, RPC pools, block watchers
import 'dotenv/config';
import Fastify from 'fastify';
import pino from 'pino';
import { loadConfig, bnbRpcUrls, solanaRpcUrls } from './config/env.js';
import { makeDb } from './db/client.js';
import { makeBnbPool, destroyBnbPool } from './rpc/bnb-pool.js';
import { makeSolanaPool, solanaCall, destroySolanaPool } from './rpc/solana-pool.js';
import { startBnbWatcher } from './watcher/bnb-watcher.js';
import { startSolanaWatcher } from './watcher/solana-watcher.js';
import { startAddressRegistry } from './watcher/address-registry.js';
import { detectBnbDeposits } from './watcher/deposit-detector.js';
import { getRedisConnection, closeRedisConnection } from './queue/connection.js';
import { makeDepositConfirmQueue } from './queue/deposit-confirm.js';

const logger = pino({ name: 'wallet-engine' });

async function start(): Promise<void> {
  const cfg = loadConfig();

  // --- Fastify health server ---
  const fastify = Fastify({
    logger: { level: cfg.LOG_LEVEL },
  });

  fastify.get('/health', async () => ({ status: 'ok' }));
  fastify.get('/health/live', async () => ({ status: 'ok' }));
  fastify.get('/health/ready', async () => ({ status: 'ok' }));

  // --- Infrastructure ---
  const db = makeDb(cfg.DATABASE_URL);
  const redis = getRedisConnection(cfg.REDIS_URL);
  const depositQueue = makeDepositConfirmQueue(redis);

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
  logger.info(
    { bnb: registry.bnb.size, sol: registry.sol.size },
    'Loaded watched addresses',
  );

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
      cfg.USDC_BNB_ADDRESS,
    );
  });

  // --- Solana slot watcher (skeleton — full SPL parsing in Phase 09) ---
  const solWatcher = startSolanaWatcher(solPool.primary, async (slot) => {
    logger.debug({ slot }, 'Solana slot — SPL deposit scanning deferred to Phase 09');
  });

  // --- Start HTTP server ---
  await fastify.listen({ port: cfg.PORT, host: '0.0.0.0' });
  logger.info(`listening :${cfg.PORT}`);

  // --- Graceful shutdown ---
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal — closing wallet-engine');
    bnbWatcher.stop();
    await solWatcher.stop();
    stopRegistry();
    await depositQueue.close();
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
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
