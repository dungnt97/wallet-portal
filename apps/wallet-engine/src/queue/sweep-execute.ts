// BullMQ producer for sweep_execute jobs.
// Consumer/worker: sweep-execute-worker.ts
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'sweep-execute-queue' });

export const SWEEP_EXECUTE_QUEUE_NAME = 'sweep_execute';

export interface SweepExecuteJobData {
  sweepId: string;
  userAddressId: string;
  /** BIP-44 index extracted from derivation_path */
  derivationIndex: number;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  fromAddr: string;
  destinationHotSafe: string;
}

/** Create the BullMQ Queue instance for sweep execution */
export function makeSweepExecuteQueue(connection: IORedis): Queue<SweepExecuteJobData> {
  return new Queue<SweepExecuteJobData>(SWEEP_EXECUTE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

/** Enqueue a sweep_execute job — idempotent by sweepId */
export async function enqueueSweepExecute(
  queue: Queue<SweepExecuteJobData>,
  data: SweepExecuteJobData
): Promise<void> {
  const job = await queue.add(SWEEP_EXECUTE_QUEUE_NAME, data, {
    jobId: `sweep_execute_${data.sweepId}`,
  });
  logger.info(
    { jobId: job.id, sweepId: data.sweepId, chain: data.chain },
    'Enqueued sweep_execute job'
  );
}
