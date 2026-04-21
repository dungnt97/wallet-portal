// Recovery cancel orchestrator — admin-api side.
// EVM only: sends 0-value self-send at same nonce to pre-empt stuck tx.
// Solana: returns 410 (no nonce semantics — tx self-expires in ~2 min).
//
// Guards (in order, same as bump):
//  1. RECOVERY_ENABLED kill-switch → 503
//  2. Solana chain → 410 cancel_not_supported_on_solana
//  3. Cold-tier withdrawal → 403 cold_tier_not_supported
//  4. Already final (confirmed/completed/cancelled) → 409
//  5. Idempotency-key hit (24h TTL) → 200 with existing action
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';
import {
  AlreadyFinalError,
  ColdTierNotSupportedError,
  GasOracleError,
  NotFoundError,
  RecoveryDisabledError,
} from './recovery-bump.service.js';
import { findByIdempotencyKey } from './recovery-rate-limit.service.js';

// ── Additional cancel-specific errors ─────────────────────────────────────────

export class SolanaCannotCancelError extends Error {
  code = 'cancel_not_supported_on_solana' as const;
  remedy =
    'Solana transactions auto-expire after ~2 minutes. Wait for blockhash expiry or bump to rebroadcast.';
  constructor() {
    super('cancel_not_supported_on_solana');
  }
}

// ── Input / output ────────────────────────────────────────────────────────────

export interface CancelTxInput {
  entityType: 'withdrawal' | 'sweep';
  entityId: string;
  staffId: string;
  idempotencyKey: string;
}

export interface CancelTxOutput {
  actionId: string;
  cancelTxHash: string;
  /** true when idempotency key was already used */
  idempotentReplay: boolean;
}

// ── Wallet-engine call ────────────────────────────────────────────────────────

async function callWalletEngineCancel(payload: {
  entityType: string;
  entityId: string;
  chain: string;
  originalTxHash: string;
  nonce: number;
  feeMultiplier: number;
  hdIndex: number;
  chainId: string;
  hotSafeAddress: string;
}): Promise<{ txHash: string }> {
  const baseUrl = process.env.WALLET_ENGINE_URL ?? 'http://localhost:3002';
  const token = process.env.SVC_BEARER_TOKEN ?? '';

  const res = await fetch(`${baseUrl}/internal/recovery/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = (body as { code?: string }).code ?? 'WALLET_ENGINE_ERROR';
    const msg =
      (body as { message?: string }).message ?? `wallet-engine cancel failed: HTTP ${res.status}`;
    if (res.status === 503 || code === 'GAS_ORACLE_UNAVAILABLE') {
      throw new GasOracleError(msg);
    }
    throw new Error(`${code}: ${msg}`);
  }

  return (await res.json()) as { txHash: string };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Execute a cancel-replace on a stuck EVM withdrawal or sweep.
 * Solana entities return 410. All guards validated before wallet-engine call.
 */
export async function cancelTx(
  db: Db,
  input: CancelTxInput,
  notifyFn: (opts: { title: string; body: string; actionId: string }) => Promise<void>
): Promise<CancelTxOutput> {
  const { entityType, entityId, staffId, idempotencyKey } = input;

  // 1. Kill-switch
  if (process.env.RECOVERY_ENABLED === 'false') {
    throw new RecoveryDisabledError();
  }

  // 2. Idempotency check before loading entity
  const existing = await findByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      actionId: existing.id,
      cancelTxHash: existing.newTxHash ?? '',
      idempotentReplay: true,
    };
  }

  // 3. Load entity
  const entity = await loadEntity(db, entityType, entityId);
  if (!entity) {
    throw new NotFoundError(`${entityType} ${entityId} not found`);
  }

  // 4. Solana guard — before cold-tier to give clearer 410 error
  if (entity.chain === 'sol') {
    throw new SolanaCannotCancelError();
  }

  // 5. Cold-tier guard
  if (
    entityType === 'withdrawal' &&
    (entity as typeof schema.withdrawals.$inferSelect).sourceTier === 'cold'
  ) {
    throw new ColdTierNotSupportedError();
  }

  // 6. Terminal state guard
  const status = entity.status as string;
  if (['confirmed', 'completed', 'cancelled', 'cancelling', 'failed'].includes(status)) {
    throw new AlreadyFinalError(status);
  }

  // 7. Validate nonce exists (required for EVM cancel)
  const txHash = (entity as { txHash?: string | null }).txHash;
  const nonce = (entity as { nonce?: number | null }).nonce;

  if (!txHash) {
    throw new NotFoundError(`${entityType} ${entityId} has no tx_hash — cannot cancel`);
  }
  if (nonce == null) {
    throw new NotFoundError(`${entityType} ${entityId} has no nonce — cannot cancel`);
  }

  // 8. Call wallet-engine cancel
  const cancelFeeMultiplier = Number(process.env.RECOVERY_CANCEL_FEE_MULT ?? '1.2');
  const chainId = process.env.BNB_CHAIN_ID ?? '56';
  // Hot-safe address = destination of the 0-value cancel tx (self-send from hot-safe)
  const hotSafeAddress =
    process.env.HOT_SAFE_ADDRESS ?? '0x0000000000000000000000000000000000000001';

  const walletResult = await callWalletEngineCancel({
    entityType,
    entityId,
    chain: entity.chain as string,
    originalTxHash: txHash,
    nonce,
    feeMultiplier: cancelFeeMultiplier,
    hdIndex: 0,
    chainId,
    hotSafeAddress,
  });

  const cancelTxHash = walletResult.txHash;

  // 9. Persist recovery_action row
  const [actionRow] = await db
    .insert(schema.recoveryActions)
    .values({
      idempotencyKey,
      actionType: 'cancel',
      entityType,
      entityId,
      chain: entity.chain as string,
      originalTxHash: txHash,
      newTxHash: cancelTxHash,
      gasPriceGwei: '0',
      status: 'broadcast',
      initiatedBy: staffId,
    })
    .returning();

  if (!actionRow) {
    throw new Error('Failed to insert recovery_action row');
  }

  // 10. Update entity status to 'cancelling' (confirm-watcher will flip to 'cancelled')
  await updateEntityCancelling(db, entityType, entityId, cancelTxHash);

  // 11. Audit
  await emitAudit(db, {
    staffId,
    action: 'recovery.cancel.executed',
    resourceType: entityType,
    resourceId: entityId,
    changes: {
      originalTxHash: txHash,
      cancelTxHash,
      status: { from: status, to: 'cancelling' },
    },
  });

  // 12. Notify (fire-and-forget)
  notifyFn({
    title: `Recovery cancel: ${entityType} ${entityId.slice(0, 8)}…`,
    body: `Cancel tx: ${cancelTxHash.slice(0, 16)}… — status → cancelling`,
    actionId: actionRow.id,
  }).catch(() => {
    /* non-fatal */
  });

  return { actionId: actionRow.id, cancelTxHash, idempotentReplay: false };
}

// ── Entity helpers ────────────────────────────────────────────────────────────

type EntityRow = typeof schema.withdrawals.$inferSelect | typeof schema.sweeps.$inferSelect;

async function loadEntity(
  db: Db,
  entityType: 'withdrawal' | 'sweep',
  entityId: string
): Promise<EntityRow | null> {
  if (entityType === 'withdrawal') {
    return (
      (await db.query.withdrawals.findFirst({
        where: eq(schema.withdrawals.id, entityId),
      })) ?? null
    );
  }
  return (
    (await db.query.sweeps.findFirst({
      where: eq(schema.sweeps.id, entityId),
    })) ?? null
  );
}

async function updateEntityCancelling(
  db: Db,
  entityType: 'withdrawal' | 'sweep',
  entityId: string,
  cancelTxHash: string
): Promise<void> {
  const now = new Date();
  if (entityType === 'withdrawal') {
    await db
      .update(schema.withdrawals)
      .set({ status: 'cancelling', cancelledNonceTxHash: cancelTxHash, updatedAt: now })
      .where(eq(schema.withdrawals.id, entityId));
  } else {
    // Sweeps don't have 'cancelling' status — mark as 'failed' to indicate it won't confirm
    await db
      .update(schema.sweeps)
      .set({ cancelledNonceTxHash: cancelTxHash, updatedAt: now })
      .where(eq(schema.sweeps.id, entityId));
  }
}
