// Solana slot watcher — subscribes to slot changes via Connection.onSlotChange
import type { Connection } from '@solana/web3.js';
import pino from 'pino';

const logger = pino({ name: 'solana-watcher' });

export interface SolanaWatcher {
  stop: () => Promise<void>;
}

/**
 * Start watching Solana slots via WebSocket subscription.
 * Calls `onSlot` with each new slot as it arrives.
 * Falls back to polling via setInterval if subscription fails.
 */
export function startSolanaWatcher(
  connection: Connection,
  onSlot: (slot: number) => Promise<void>,
): SolanaWatcher {
  let lastSlot = -1;
  let subscriptionId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const POLL_INTERVAL_MS = 1_000;

  const processSlot = async (slot: number): Promise<void> => {
    if (stopped || slot <= lastSlot) return;
    lastSlot = slot;
    try {
      await onSlot(slot);
    } catch (err) {
      logger.error({ err, slot }, 'Solana onSlot handler error');
    }
  };

  const startPolling = (): void => {
    intervalId = setInterval(() => {
      connection
        .getSlot()
        .then(processSlot)
        .catch((err) => logger.warn({ err }, 'Solana poll getSlot error'));
    }, POLL_INTERVAL_MS);
    logger.info({ intervalMs: POLL_INTERVAL_MS }, 'Solana watcher using poll fallback');
  };

  try {
    subscriptionId = connection.onSlotChange((slotInfo) => {
      void processSlot(slotInfo.slot);
    });
    logger.info({ subscriptionId }, 'Solana watcher subscribed to slot changes');
  } catch (err) {
    logger.warn({ err }, 'Solana onSlotChange failed — using polling');
    startPolling();
  }

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (subscriptionId !== null) {
        try {
          await connection.removeSlotChangeListener(subscriptionId);
        } catch (err) {
          logger.warn({ err }, 'Error removing Solana slot listener');
        }
      }
      if (intervalId !== null) clearInterval(intervalId);
      logger.info('Solana watcher stopped');
    },
  };
}
