// Signer ceremony cancel service — idempotent cancel for pending/in_progress ceremonies
// with no chain broadcast yet. Marks both multisig ops expired + ceremony cancelled.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { ChainCeremonyState } from '../db/schema/signer-ceremonies.js';
import { emitAudit } from './audit.service.js';
import { ConflictError, NotFoundError } from './signer-ceremony-validate.service.js';

export { NotFoundError, ConflictError } from './signer-ceremony-validate.service.js';

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Cancel a signer ceremony if it is still in a cancellable state.
 *
 * Cancellable: status IN ('pending', 'in_progress') AND no chain has status
 * 'executing' or 'confirmed' (i.e., no tx has been broadcast on-chain).
 *
 * Idempotent: if already 'cancelled', returns without error.
 */
export async function cancelCeremony(db: Db, ceremonyId: string, staffId: string): Promise<void> {
  const ceremony = await db.query.signerCeremonies.findFirst({
    where: eq(schema.signerCeremonies.id, ceremonyId),
  });

  if (!ceremony) throw new NotFoundError(`Ceremony ${ceremonyId} not found`);

  // Already cancelled — idempotent success
  if (ceremony.status === 'cancelled') return;

  // Confirmed or partial — cannot cancel after on-chain broadcast
  if (ceremony.status === 'confirmed' || ceremony.status === 'partial') {
    throw new ConflictError(
      `Ceremony ${ceremonyId} is in status '${ceremony.status}' — cannot cancel after on-chain broadcast`
    );
  }

  // Check no chain has been broadcast (executing or confirmed chain state)
  const blockedStatuses = new Set(['executing', 'confirmed']);
  const chainStates = ceremony.chainStates ?? {};
  for (const [chain, state] of Object.entries(chainStates) as [string, ChainCeremonyState][]) {
    if (blockedStatuses.has(state.status)) {
      throw new ConflictError(
        `Cannot cancel: chain '${chain}' is already at status '${state.status}' — ceremony must complete or be reconciled as partial`
      );
    }
  }

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    // Collect linked multisig op ids from chain_states
    const opIds: string[] = Object.values(chainStates)
      .map((s) => (s as ChainCeremonyState).multisigOpId)
      .filter((id): id is string => Boolean(id));

    // Expire linked multisig ops (only if still pending/collecting)
    if (opIds.length > 0) {
      await txDb
        .update(schema.multisigOperations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            inArray(schema.multisigOperations.id, opIds),
            inArray(schema.multisigOperations.status, ['pending', 'collecting'])
          )
        );
    }

    // Build cancelled chain states
    const cancelledStates = Object.fromEntries(
      Object.entries(chainStates).map(([chain, state]) => [
        chain,
        { ...(state as ChainCeremonyState), status: 'cancelled' as const },
      ])
    );

    // Mark ceremony cancelled
    await txDb
      .update(schema.signerCeremonies)
      .set({
        status: 'cancelled',
        chainStates: cancelledStates,
        updatedAt: new Date(),
      })
      .where(eq(schema.signerCeremonies.id, ceremonyId));

    await emitAudit(txDb, {
      staffId,
      action: 'signer.ceremony.cancelled',
      resourceType: 'signer_ceremony',
      resourceId: ceremonyId,
      changes: { previousStatus: ceremony.status },
    });
  });
}
