// BullMQ deposit_confirm worker — polls chain for N confirmations then credits deposit.
// Dev-mode (WATCHER_ENABLED=false or simulated=true): credits immediately without RPC.
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { creditDeposit } from '../../services/admin-api-client.js';
import { QUEUE_NAME } from '../deposit-confirm.js';
import { startHeartbeat } from '../worker-heartbeat.js';

const logger = pino({ name: 'deposit-confirm-worker' });

/** Confirmation depth thresholds */
const CONFIRM_DEPTH_BNB = 12;
const CONFIRM_DEPTH_SOLANA = 32;

export interface DepositConfirmJobData {
  depositId: string;
  chain: 'bnb' | 'sol';
  txHash: string;
  detectedAtBlock: number;
  /** When true: skip RPC confirmation, credit immediately (CI/dev mode) */
  simulated?: boolean;
}

interface ConfirmResult {
  confirmed: boolean;
  confirmations: number;
}

/** Check BNB transaction confirmations via provider */
export async function checkBnbConfirmations(
  txHash: string,
  cfg: AppConfig
): Promise<ConfirmResult> {
  const { JsonRpcProvider } = await import('ethers');
  const provider = new JsonRpcProvider(cfg.RPC_BNB_PRIMARY);
  try {
    const [receipt, currentBlock] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getBlockNumber(),
    ]);
    if (!receipt || receipt.blockNumber === null) {
      return { confirmed: false, confirmations: 0 };
    }
    const confirmations = currentBlock - receipt.blockNumber;
    return { confirmed: confirmations >= CONFIRM_DEPTH_BNB, confirmations };
  } finally {
    provider.destroy();
  }
}

/** Check Solana transaction confirmations via connection */
export async function checkSolanaConfirmations(
  txHash: string,
  cfg: AppConfig
): Promise<ConfirmResult> {
  const { Connection } = await import('@solana/web3.js');
  const conn = new Connection(cfg.RPC_SOLANA_PRIMARY, 'confirmed');
  const status = await conn.getSignatureStatuses([txHash], { searchTransactionHistory: true });
  const info = status.value[0];
  if (!info) {
    // Status purged from recent history — fetch tx directly to check if it exists on-chain
    const tx = await conn.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    if (tx && !tx.meta?.err) {
      return { confirmed: true, confirmations: CONFIRM_DEPTH_SOLANA };
    }
    return { confirmed: false, confirmations: 0 };
  }
  if (info.err) {
    return { confirmed: false, confirmations: 0 };
  }
  // confirmationStatus 'finalized' means max confirmations (null confirmations field)
  if (info.confirmationStatus === 'finalized') {
    return { confirmed: true, confirmations: CONFIRM_DEPTH_SOLANA };
  }
  const confirmations = info.confirmations ?? 0;
  return { confirmed: confirmations >= CONFIRM_DEPTH_SOLANA, confirmations };
}

/**
 * Start the deposit_confirm BullMQ worker.
 * Returns the Worker instance for graceful shutdown.
 */
export function startDepositConfirmWorker(redis: IORedis, cfg: AppConfig): Worker {
  // Dev-mode flag: skip RPC confirmation when watcher is disabled or job is simulated
  const watcherEnabled = cfg.WATCHER_ENABLED;

  // Heartbeat writer — health endpoint reads worker:deposit-confirm:heartbeat
  const stopHeartbeat = startHeartbeat(redis, 'deposit-confirm');

  const worker = new Worker<DepositConfirmJobData>(
    QUEUE_NAME,
    async (job) => {
      const { depositId, txHash, chain, simulated } = job.data;
      logger.info(
        { jobId: job.id, depositId, txHash, chain, simulated },
        'Processing deposit_confirm job'
      );

      const devMode = simulated === true || !watcherEnabled;

      if (!devMode) {
        // Real confirmation polling
        let result: ConfirmResult;
        try {
          if (chain === 'bnb') {
            result = await checkBnbConfirmations(txHash, cfg);
          } else {
            result = await checkSolanaConfirmations(txHash, cfg);
          }
        } catch (err) {
          logger.error({ err, depositId, txHash, chain }, 'RPC confirmation check failed');
          // Throw to trigger BullMQ retry with backoff
          throw new Error(`RPC confirmation check failed for ${depositId}: ${String(err)}`);
        }

        logger.info(
          {
            depositId,
            txHash,
            chain,
            confirmations: result.confirmations,
            confirmed: result.confirmed,
          },
          'Confirmation check result'
        );

        if (!result.confirmed) {
          // Not enough confirmations yet — throw to reschedule with backoff
          throw new Error(
            `Deposit ${depositId} not yet confirmed (${result.confirmations} confs, need ${chain === 'bnb' ? CONFIRM_DEPTH_BNB : CONFIRM_DEPTH_SOLANA})`
          );
        }
      } else {
        logger.info({ depositId, devMode }, 'Dev/simulated mode — skipping RPC confirmation check');
      }

      // Credit the deposit via admin-api
      const creditResult = await creditDeposit(
        { baseUrl: cfg.ADMIN_API_BASE_URL, bearerToken: cfg.SVC_BEARER_TOKEN },
        depositId
      );

      if (!creditResult.success) {
        if (creditResult.status === 409) {
          // Already credited — idempotent success
          logger.info({ depositId }, 'Deposit already credited (409) — treating as success');
          return;
        }
        throw new Error(`Credit failed for deposit ${depositId} — status ${creditResult.status}`);
      }

      logger.info({ depositId, txHash }, 'Deposit credited successfully');
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'deposit_confirm job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'deposit_confirm job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'deposit_confirm worker error');
  });

  // Stop heartbeat when worker closes
  worker.on('closing', () => stopHeartbeat());

  return worker;
}
