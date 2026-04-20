// BullMQ deposit_confirm worker — consumes jobs, calls admin-api to credit deposit
// In MVP: simulated=true → skip RPC polling, call credit immediately
// In production: poll chain for N confirmations before crediting
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { creditDeposit } from '../../services/admin-api-client.js';
import { QUEUE_NAME } from '../deposit-confirm.js';

const logger = pino({ name: 'deposit-confirm-worker' });

export interface DepositConfirmJobData {
  depositId: string;
  chain: 'bnb' | 'sol';
  txHash: string;
  detectedAtBlock: number;
  /** When true: skip RPC confirmation, credit immediately (CI/test mode) */
  simulated?: boolean;
}

/**
 * Start the deposit_confirm BullMQ worker.
 * Returns the Worker instance so the caller can close it on shutdown.
 */
export function startDepositConfirmWorker(redis: IORedis, cfg: AppConfig): Worker {
  const worker = new Worker<DepositConfirmJobData>(
    QUEUE_NAME,
    async (job) => {
      const { depositId, txHash, simulated } = job.data;
      logger.info({ jobId: job.id, depositId, txHash, simulated }, 'Processing deposit_confirm job');

      if (!simulated) {
        // Production path: poll RPC for confirmations (deferred beyond MVP)
        // In real implementation: call bnb/sol RPC to verify tx hash + block confirmations
        logger.warn({ depositId }, 'Non-simulated job — real RPC confirmation not yet implemented; crediting anyway for MVP');
      }

      // Call admin-api to credit the deposit (creates ledger entries + audit log + socket emit)
      const result = await creditDeposit(
        { baseUrl: cfg.ADMIN_API_BASE_URL, bearerToken: cfg.SVC_BEARER_TOKEN },
        depositId,
      );

      if (!result.success) {
        if (result.status === 409) {
          // Already credited — idempotent success, don't retry
          logger.info({ depositId }, 'Deposit already credited (409) — treating as success');
          return;
        }
        // 4xx/5xx other than 409 — throw to trigger BullMQ retry with backoff
        throw new Error(`Credit failed for deposit ${depositId} — status ${result.status}`);
      }

      logger.info({ depositId, txHash }, 'Deposit credited successfully');
    },
    {
      connection: redis,
      // Concurrency: 5 simultaneous jobs
      concurrency: 5,
    },
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

  return worker;
}
