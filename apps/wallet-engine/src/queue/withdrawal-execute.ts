// BullMQ producer for withdrawal_execute jobs
// Consumer/worker: withdrawal-execute-worker.ts
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'withdrawal-execute-queue' });

export const WITHDRAWAL_EXECUTE_QUEUE_NAME = 'withdrawal_execute';

export interface WithdrawalExecuteJobData {
  withdrawalId: string;
  multisigOpId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  destinationAddr: string;
  sourceTier: 'hot' | 'cold';
}

/** Create the BullMQ Queue instance for withdrawal execution */
export function makeWithdrawalExecuteQueue(connection: IORedis): Queue<WithdrawalExecuteJobData> {
  return new Queue<WithdrawalExecuteJobData>(WITHDRAWAL_EXECUTE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

/** Enqueue a withdrawal_execute job — idempotent by withdrawalId */
export async function enqueueWithdrawalExecute(
  queue: Queue<WithdrawalExecuteJobData>,
  data: WithdrawalExecuteJobData
): Promise<void> {
  const job = await queue.add(WITHDRAWAL_EXECUTE_QUEUE_NAME, data, {
    jobId: `withdrawal_execute:${data.withdrawalId}`,
  });
  logger.info(
    { jobId: job.id, withdrawalId: data.withdrawalId, chain: data.chain },
    'Enqueued withdrawal_execute job'
  );
}
