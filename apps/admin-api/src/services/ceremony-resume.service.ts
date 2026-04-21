// Ceremony resume service — on-boot reconciliation for orphaned signer ceremonies.
//
// Responsibilities:
//  1. On boot: scan signer_ceremonies WHERE status IN ('in_progress','partial')
//     → re-enqueue ceremony worker jobs per chain (idempotent via jobId).
//  2. Partial-stale alert: ceremonies with status='partial' older than 1h → emit
//     admin notification so operators know manual reconciliation is needed.
//
// Called once from app.ts addHook('onReady').
import type { Queue } from 'bullmq';
import { and, inArray, lt } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { ChainCeremonyState } from '../db/schema/signer-ceremonies.js';
import type { EmailJobData, SlackJobData } from './notify-staff.service.js';
import { notifyStaff } from './notify-staff.service.js';
import type { CeremonyJobData } from './signer-add.service.js';

/* eslint-disable no-console */
const logger = {
  info: (obj: Record<string, unknown>, msg: string) => console.info('[ceremony-resume]', msg, obj),
  warn: (obj: Record<string, unknown>, msg: string) => console.warn('[ceremony-resume]', msg, obj),
  error: (obj: Record<string, unknown>, msg: string) =>
    console.error('[ceremony-resume]', msg, obj),
};

/** Chains each ceremony spans. */
const CHAINS: Array<'bnb' | 'sol'> = ['bnb', 'sol'];

/** Partial ceremonies older than this are considered stale → notify admins. */
const PARTIAL_STALE_MS = 60 * 60 * 1000; // 1 hour

// ── Public entry point ────────────────────────────────────────────────────────

export interface CeremonyResumeResult {
  requeued: number;
  partialStaleNotified: number;
}

/**
 * Scan and resume in-flight signer ceremonies on admin-api boot.
 *
 * Safe to call repeatedly — BullMQ deduplicates jobs by jobId
 * (`ceremony:<id>:<chain>`) so no double-processing occurs.
 */
export async function resumeInFlightCeremonies(
  db: Db,
  ceremonyQueue: Queue<CeremonyJobData>,
  io: SocketIOServer,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>
): Promise<CeremonyResumeResult> {
  let requeued = 0;
  let partialStaleNotified = 0;

  try {
    // 1. Find all in-flight ceremonies (in_progress = worker jobs may have been lost)
    const inFlight = await db
      .select()
      .from(schema.signerCeremonies)
      .where(inArray(schema.signerCeremonies.status, ['in_progress']));

    for (const ceremony of inFlight) {
      const chainStates = (ceremony.chainStates ?? {}) as Record<string, ChainCeremonyState>;

      for (const chain of CHAINS) {
        const chainState = chainStates[chain === 'bnb' ? 'bnb' : 'solana'];
        // Skip chains that are already confirmed or failed — nothing to retry
        if (
          chainState?.status === 'confirmed' ||
          chainState?.status === 'failed' ||
          chainState?.status === 'cancelled'
        ) {
          continue;
        }

        try {
          await ceremonyQueue.add(
            'signer_ceremony',
            { ceremonyId: ceremony.id, chain },
            {
              jobId: `ceremony:${ceremony.id}:${chain}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 15_000 },
              removeOnComplete: { count: 500 },
              removeOnFail: { count: 1000 },
            }
          );
          requeued++;
          logger.info(
            { ceremonyId: ceremony.id, chain },
            'Re-enqueued orphaned ceremony job on boot'
          );
        } catch (err) {
          // Duplicate jobId throws with BullMQ — means job already queued, safe to ignore
          const isDuplicate =
            err instanceof Error && err.message.includes('Job is already waiting');
          if (!isDuplicate) {
            logger.error({ ceremonyId: ceremony.id, chain, err }, 'Failed to re-enqueue ceremony');
          }
        }
      }
    }

    // 2. Find stale partial ceremonies (one chain done, other failed, older than 1h)
    const staleThreshold = new Date(Date.now() - PARTIAL_STALE_MS);
    const partialStale = await db
      .select()
      .from(schema.signerCeremonies)
      .where(
        and(
          inArray(schema.signerCeremonies.status, ['partial']),
          lt(schema.signerCeremonies.updatedAt, staleThreshold)
        )
      );

    for (const ceremony of partialStale) {
      try {
        await notifyStaff(
          db,
          io,
          {
            role: 'admin',
            eventType: 'signer.ceremony.failed',
            severity: 'critical',
            title: 'Stale partial ceremony requires manual reconciliation',
            body: `Ceremony ${ceremony.id} (${ceremony.operationType}) has been in 'partial' state for over 1 hour. One chain confirmed, the other failed. Manual action required — follow the signer-rotation runbook.`,
            payload: {
              ceremonyId: ceremony.id,
              operationType: ceremony.operationType,
              status: 'partial',
            },
            dedupeKey: `ceremony_partial_stale:${ceremony.id}`,
          },
          emailQueue,
          slackQueue
        );

        io.of('/stream').emit('signer.ceremony.stale_partial', { ceremonyId: ceremony.id });

        partialStaleNotified++;
        logger.warn(
          { ceremonyId: ceremony.id, operationType: ceremony.operationType },
          'Stale partial ceremony — admin notified'
        );
      } catch (err) {
        logger.error(
          { ceremonyId: ceremony.id, err },
          'Failed to notify about stale partial ceremony'
        );
      }
    }

    logger.info({ requeued, partialStaleNotified }, 'Ceremony resume scan complete');
  } catch (err) {
    logger.error({ err }, 'Ceremony resume scan failed');
  }

  return { requeued, partialStaleNotified };
}
