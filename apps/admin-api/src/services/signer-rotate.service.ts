// Signer rotate ceremony service — atomically add + remove multisig owners.
// Single ceremony row with both target_add + target_remove populated.
// Per chain: one multisig_op with operation_type='signer_rotate'; worker builds multicall.
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
  requireActiveKeysForBothChains,
} from './signer-ceremony-validate.service.js';

export { NotFoundError, ValidationError } from './signer-ceremony-validate.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_THRESHOLD = 2;

// ── Input / output ────────────────────────────────────────────────────────────

export interface RotateSignersInput {
  addStaffIds: string[];
  removeStaffIds: string[];
  reason?: string | undefined;
}

export interface RotateSignersResult {
  ceremonyId: string;
  bnbOpId: string;
  solanaOpId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Create a signer_rotate ceremony:
 *  1. Validate both lists are non-empty and disjoint
 *  2. Validate each addStaffId has active keys on both chains
 *  3. Validate each removeStaffId is a current treasurer
 *  4. Post-state size check: (current + adds - removes) >= MIN_THRESHOLD
 *  5. DB transaction: insert ceremony + 2 multisig ops
 *  6. Enqueue ceremony worker jobs per chain
 *  7. Notify treasurers
 */
export async function rotateSigners(
  db: Db,
  initiatorStaffId: string,
  input: RotateSignersInput,
  io: SocketIOServer,
  ceremonyQueue: Queue<CeremonyJobData>,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>
): Promise<RotateSignersResult> {
  const { addStaffIds, removeStaffIds, reason } = input;

  // 1. Basic non-empty + disjoint check
  if (addStaffIds.length === 0 || removeStaffIds.length === 0) {
    throw new ValidationError(
      'signer_rotate requires at least one staff in both add and remove lists'
    );
  }
  const addSet = new Set(addStaffIds);
  for (const id of removeStaffIds) {
    if (addSet.has(id)) {
      throw new ValidationError(`Staff ${id} appears in both add and remove lists`);
    }
  }

  // 2. Validate all add targets have active keys on both chains
  for (const staffId of addStaffIds) {
    const staff = await loadStaff(db, staffId);
    if (staff.status !== 'active') {
      throw new ValidationError(`Add target ${staffId} is not active (status: ${staff.status})`);
    }
    await requireActiveKeysForBothChains(db, staffId);
  }

  // 3. Validate remove targets are current treasurers
  for (const staffId of removeStaffIds) {
    const staff = await loadStaff(db, staffId);
    if (staff.role !== 'treasurer') {
      throw new ValidationError(
        `Remove target ${staffId} is not a treasurer (role: ${staff.role})`
      );
    }
  }

  // 4. Post-state size validation
  const currentCount = await getActiveTreasurerCount(db);
  const postCount = currentCount + addStaffIds.length - removeStaffIds.length;
  if (postCount < MIN_THRESHOLD) {
    throw new ValidationError(
      `Rotation would leave ${postCount} active treasurer(s); minimum is ${MIN_THRESHOLD}`
    );
  }

  // 5. DB transaction
  let ceremonyId = '';
  let bnbOpId = '';
  let solanaOpId = '';

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    bnbOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '',
      chain: 'bnb',
      operationType: 'signer_rotate',
    });
    solanaOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '',
      chain: 'sol',
      operationType: 'signer_rotate',
    });

    const chainStates: CeremonyChainStates = {
      bnb: { status: 'pending', multisigOpId: bnbOpId },
      solana: { status: 'pending', multisigOpId: solanaOpId },
    };

    const [ceremony] = await (tx as unknown as Db)
      .insert(schema.signerCeremonies)
      .values({
        operationType: 'signer_rotate',
        initiatedBy: initiatorStaffId,
        targetAdd: addStaffIds,
        targetRemove: removeStaffIds,
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
        operationType: 'signer_rotate',
        addStaffIds,
        removeStaffIds,
        bnbOpId,
        solanaOpId,
        reason: reason ?? null,
      },
    });
  });

  // 6. Enqueue per-chain jobs
  for (const chain of ['bnb', 'sol'] as const) {
    await ceremonyQueue.add(
      'signer_ceremony',
      { ceremonyId, chain },
      {
        jobId: `ceremony:${ceremonyId}:${chain}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      }
    );
  }

  // 7. Notify
  await notifyStaff(
    db,
    io,
    {
      role: 'treasurer',
      eventType: 'signer.ceremony.started',
      severity: 'warning',
      title: 'Signer ceremony started: rotate',
      body: `A signer-rotate ceremony was initiated (${addStaffIds.length} added, ${removeStaffIds.length} removed). Ceremony: ${ceremonyId}`,
      payload: { ceremonyId, operationType: 'signer_rotate', addStaffIds, removeStaffIds },
      dedupeKey: `signer_ceremony:${ceremonyId}`,
    },
    emailQueue,
    slackQueue
  );

  io.of('/stream').emit('signer.ceremony.created', { ceremonyId, operationType: 'signer_rotate' });

  return { ceremonyId, bnbOpId, solanaOpId };
}
