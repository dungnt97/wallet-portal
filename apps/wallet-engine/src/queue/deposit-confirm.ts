// BullMQ producer for deposit_confirm jobs
// Consumer/worker wired in Phase 09 — this phase only provides the enqueue helper.
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'deposit-confirm-queue' });

export const QUEUE_NAME = 'deposit_confirm';

export interface DepositConfirmJobData {
  depositId: string;
  chain: 'bnb' | 'sol';
  txHash: string;
  detectedAtBlock: number;
}

/** Create the BullMQ Queue instance for deposit confirmation */
export function makeDepositConfirmQueue(connection: IORedis): Queue<DepositConfirmJobData> {
  return new Queue<DepositConfirmJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

/** Enqueue a deposit_confirm job */
export async function enqueueDepositConfirm(
  queue: Queue<DepositConfirmJobData>,
  data: DepositConfirmJobData
): Promise<void> {
  const job = await queue.add('deposit_confirm', data, {
    jobId: `deposit:${data.txHash}`, // Idempotent — deduplicates by tx hash
  });
  logger.info({ jobId: job.id, txHash: data.txHash }, 'Enqueued deposit_confirm job');
}
