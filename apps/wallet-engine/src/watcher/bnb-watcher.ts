// BNB block watcher — polls new blocks via provider, emits block numbers to callback
import type { FallbackProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'bnb-watcher' });

/** Poll interval fallback if provider event subscription fails */
const POLL_INTERVAL_MS = 3_000;

export interface BnbWatcher {
  stop: () => void;
}

/**
 * Start watching BNB blocks. Attempts provider.on('block') first;
 * falls back to setInterval polling if the event-based approach errors.
 *
 * Calls `onBlock` with each new block number as it arrives.
 */
export function startBnbWatcher(
  provider: FallbackProvider,
  onBlock: (blockNumber: number) => Promise<void>,
): BnbWatcher {
  let lastBlock = -1;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const processBlock = async (blockNumber: number): Promise<void> => {
    if (stopped || blockNumber <= lastBlock) return;
    lastBlock = blockNumber;
    try {
      await onBlock(blockNumber);
    } catch (err) {
      logger.error({ err, blockNumber }, 'BNB onBlock handler error');
    }
  };

  // Try event-based subscription; fall back to polling on error
  const startPolling = (): void => {
    intervalId = setInterval(() => {
      provider
        .getBlockNumber()
        .then(processBlock)
        .catch((err) => logger.warn({ err }, 'BNB poll getBlockNumber error'));
    }, POLL_INTERVAL_MS);
    logger.info({ intervalMs: POLL_INTERVAL_MS }, 'BNB watcher using poll fallback');
  };

  try {
    provider.on('block', (blockNumber: number) => {
      void processBlock(blockNumber);
    });
    logger.info('BNB watcher subscribed to block events');
  } catch (err) {
    logger.warn({ err }, 'BNB provider.on("block") failed — using polling');
    startPolling();
  }

  return {
    stop(): void {
      stopped = true;
      provider.off('block');
      if (intervalId !== null) clearInterval(intervalId);
      logger.info('BNB watcher stopped');
    },
  };
}
