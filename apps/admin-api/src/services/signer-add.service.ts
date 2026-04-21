// Signer add ceremony service — create a ceremony to add one new multisig owner.
// Validates target staff has active signing keys on both chains, then creates:
//   - 1 signer_ceremonies row (operation_type='signer_add')
//   - 2 multisig_operations rows (one per chain)
// Enqueues ceremony worker jobs and emits notifications.
import type { Queue } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { CeremonyChainStates } from '../db/schema/signer-ceremonies.js';
import { emitAudit } from './audit.service.js';
import { notifyStaff } from './notify-staff.service.js';
import type { EmailJobData, SlackJobData } from './notify-staff.service.js';
import {
  NotFoundError,
  ValidationError,
  insertCeremonyMultisigOp,
  loadStaff,
  requireActiveKeysForBothChains,
} from './signer-ceremony-validate.service.js';

export { NotFoundError, ValidationError } from './signer-ceremony-validate.service.js';

// ── Job payload ───────────────────────────────────────────────────────────────

export interface CeremonyJobData {
  ceremonyId: string;
  chain: 'bnb' | 'sol';
}

// ── Input / output ────────────────────────────────────────────────────────────

export interface AddSignerInput {
  targetStaffId: string;
  reason?: string | undefined;
}

export interface AddSignerResult {
  ceremonyId: string;
  bnbOpId: string;
  solanaOpId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Create a signer_add ceremony:
 *  1. Validate target staff exists + has active keys on BNB + Solana
 *  2. DB transaction: insert ceremony + 2 multisig ops
 *  3. Enqueue ceremony worker jobs per chain
 *  4. Notify treasurers
 */
export async function addSigner(
  db: Db,
  initiatorStaffId: string,
  input: AddSignerInput,
  io: SocketIOServer,
  ceremonyQueue: Queue<CeremonyJobData>,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>
): Promise<AddSignerResult> {
  const { targetStaffId, reason } = input;

  // 1. Validate target staff + keys
  const target = await loadStaff(db, targetStaffId);
  if (target.status !== 'active') {
    throw new ValidationError(`Staff ${targetStaffId} is not active (status: ${target.status})`);
  }
  await requireActiveKeysForBothChains(db, targetStaffId);

  // 2. DB transaction: ceremony + 2 multisig ops
  let ceremonyId = '';
  let bnbOpId = '';
  let solanaOpId = '';

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    // Create multisig ops first (ceremony chain_states references their ids)
    bnbOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '', // will patch below
      chain: 'bnb',
      operationType: 'signer_add',
    });
    solanaOpId = await insertCeremonyMultisigOp(txDb, {
      ceremonyId: '',
      chain: 'sol',
      operationType: 'signer_add',
    });

    const chainStates: CeremonyChainStates = {
      bnb: { status: 'pending', multisigOpId: bnbOpId },
      solana: { status: 'pending', multisigOpId: solanaOpId },
    };

    const [ceremony] = await (tx as unknown as Db)
      .insert(schema.signerCeremonies)
      .values({
        operationType: 'signer_add',
        initiatedBy: initiatorStaffId,
        targetAdd: [targetStaffId],
        targetRemove: [],
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
        operationType: 'signer_add',
        targetStaffId,
        bnbOpId,
        solanaOpId,
        reason: reason ?? null,
      },
    });
  });

  // 3. Enqueue per-chain ceremony worker jobs (idempotent by jobId)
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

  // 4. Notify all treasurers
  await notifyStaff(
    db,
    io,
    {
      role: 'treasurer',
      eventType: 'signer.ceremony.started',
      severity: 'warning',
      title: 'Signer ceremony started: add',
      body: `A new signer-add ceremony was initiated. Target staff: ${target.name}. Ceremony: ${ceremonyId}`,
      payload: { ceremonyId, operationType: 'signer_add', targetStaffId },
      dedupeKey: `signer_ceremony:${ceremonyId}`,
    },
    emailQueue,
    slackQueue
  );

  io.of('/stream').emit('signer.ceremony.created', { ceremonyId, operationType: 'signer_add' });

  return { ceremonyId, bnbOpId, solanaOpId };
}
