// Signer remove ceremony service — create a ceremony to remove a multisig owner.
// Pre-check: cannot remove below threshold (e.g., 2-of-3 can remove 1; 2-of-2 cannot).
import type { Queue } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { CeremonyChainStates } from '../db/schema/signer-ceremonies.js';
import { emitAudit } from './audit.service.js';
import { notifyStaff } from './notify-staff.service.js';
import type { EmailJobData, SlackJobData } from './notify-staff.service.js';
import type { CeremonyJobData } from './signer-add.service.js';
import {
  NotFoundError,
  ValidationError,
  getActiveTreasurerCount,
  insertCeremonyMultisigOp,
  loadStaff,
} from './signer-ceremony-validate.service.js';

export { NotFoundError, ValidationError } from './signer-ceremony-validate.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum multisig threshold enforced by the system */
const MIN_THRESHOLD = 2;

// ── Input / output ────────────────────────────────────────────────────────────

export interface RemoveSignerInput {
  targetStaffId: string;
  reason?: string | undefined;
}

export interface RemoveSignerResult {
  ceremonyId: string;
  bnbOpId: string;
  solanaOpId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Create a signer_remove ceremony:
 *  1. Validate target exists + is currently a treasurer
 *  2. Threshold check: post-remove owner count must remain >= MIN_THRESHOLD
 *  3. DB transaction: insert ceremony + 2 multisig ops
 *  4. Enqueue ceremony worker jobs per chain
 *  5. Notify treasurers
 */
export async function removeSigner(
  db: Db,
  initiatorStaffId: string,
  input: RemoveSignerInput,
  io: SocketIOServer,
  ceremonyQueue: Queue<CeremonyJobData>,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>
): Promise<RemoveSignerResult> {
  const { targetStaffId, reason } = input;

  // 1. Validate target staff
  const target = await loadStaff(db, targetStaffId);
  if (target.role !== 'treasurer') {
    throw new ValidationError(
      `Staff ${targetStaffId} is not a treasurer (role: ${target.role}) — only treasurers are multisig owners`
    );
  }

  // 2. Threshold guard: active treasurer count after removal must stay >= MIN_THRESHOLD
  const currentCount = await getActiveTreasurerCount(db);
  const postRemoveCount = currentCount - 1;
  if (postRemoveCount < MIN_THRESHOLD) {
    throw new ValidationError(
      `Cannot remove signer: would leave ${postRemoveCount} active treasurer(s); minimum is ${MIN_THRESHOLD}`
    );
  }

  // 3. DB transaction
  let ceremonyId = '';
  let bnbOpId = '';
  let solanaOpId = '';

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    bnbOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '',
      chain: 'bnb',
      operationType: 'signer_remove',
    });
    solanaOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '',
      chain: 'sol',
      operationType: 'signer_remove',
    });

    const chainStates: CeremonyChainStates = {
      bnb: { status: 'pending', multisigOpId: bnbOpId },
      solana: { status: 'pending', multisigOpId: solanaOpId },
    };

    const [ceremony] = await (tx as unknown as Db)
      .insert(schema.signerCeremonies)
      .values({
        operationType: 'signer_remove',
        initiatedBy: initiatorStaffId,
        targetAdd: [],
        targetRemove: [targetStaffId],
        chainStates,
        status: 'pending',
        reason: reason ?? null,
      })
      .returning();

    if (!ceremony) throw new Error('Failed to insert signer_ceremonies row');
    ceremonyId = ceremony.id;

    await emitAudit(txDb, {
      staffId: initiatorStaffId,
      action: 'signer.ceremony.created',
      resourceType: 'signer_ceremony',
      resourceId: ceremony.id,
      changes: {
        operationType: 'signer_remove',
        targetStaffId,
        bnbOpId,
        solanaOpId,
        reason: reason ?? null,
      },
    });
  });

  // 4. Enqueue per-chain jobs
  await ceremonyQueue.add(
    'signer_ceremony',
    { ceremonyId, chain: 'bnb' },
    {
      jobId: `ceremony:${ceremonyId}:bnb`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    }
  );
  await ceremonyQueue.add(
    'signer_ceremony',
    { ceremonyId, chain: 'sol' },
    {
      jobId: `ceremony:${ceremonyId}:sol`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    }
  );

  // 5. Notify
  await notifyStaff(
    db,
    io,
    {
      role: 'treasurer',
      eventType: 'signer.ceremony.started',
      severity: 'warning',
      title: 'Signer ceremony started: remove',
      body: `A signer-remove ceremony was initiated. Removing: ${target.name}. Ceremony: ${ceremonyId}`,
      payload: { ceremonyId, operationType: 'signer_remove', targetStaffId },
      dedupeKey: `signer_ceremony:${ceremonyId}`,
    },
    emailQueue,
    slackQueue
  );

  io.of('/stream').emit('signer.ceremony.created', { ceremonyId, operationType: 'signer_remove' });

  return { ceremonyId, bnbOpId, solanaOpId };
}
