// BullMQ producer for signer_ceremony jobs.
// Consumer/worker: signer-ceremony-broadcast-worker.ts
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'signer-ceremony-queue' });

export const SIGNER_CEREMONY_QUEUE_NAME = 'signer_ceremony';

export interface SignerCeremonyJobData {
  ceremonyId: string;
  chain: 'bnb' | 'sol';
}

/** Create the BullMQ Queue instance for signer ceremony broadcast */
export function makeSignerCeremonyQueue(connection: IORedis): Queue<SignerCeremonyJobData> {
  return new Queue<SignerCeremonyJobData>(SIGNER_CEREMONY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
}

/** Enqueue a signer_ceremony job — idempotent by ceremonyId:chain */
export async function enqueueSignerCeremony(
  queue: Queue<SignerCeremonyJobData>,
  data: SignerCeremonyJobData
): Promise<void> {
  const job = await queue.add(SIGNER_CEREMONY_QUEUE_NAME, data, {
    jobId: `ceremony:${data.ceremonyId}:${data.chain}`,
  });
  logger.info(
    { jobId: job.id, ceremonyId: data.ceremonyId, chain: data.chain },
    'Enqueued signer_ceremony job'
  );
}
