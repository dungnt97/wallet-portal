import type { StuckTxItem } from '@wp/shared-types';
// Recovery stuck-tx scanner — finds broadcast withdrawals/sweeps that have exceeded
// the configured age threshold without on-chain confirmation.
//
// Rules applied:
//  - EVM (bnb): status='broadcast' AND broadcast_at < now() - RECOVERY_EVM_STUCK_MINUTES
//  - Solana (sol): status='broadcast' AND broadcast_at < now() - RECOVERY_SOL_STUCK_SECONDS
//  - Excludes: source_tier='cold' withdrawals (cold-tier bump forbidden — 403 in service layer)
//  - canBump: bump_count < RECOVERY_MAX_BUMPS; cold-tier yields canBump=false
//  - canCancel: EVM only AND status NOT IN ('cancelling','cancelled')
import { and, eq, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface ScanConfig {
  evmStuckMinutes: number;
  solanaStuckSeconds: number;
  maxBumps: number;
}

export interface StuckScanResult {
  items: StuckTxItem[];
  thresholdsUsed: { evmMinutes: number; solanaSeconds: number };
}

/**
 * Query withdrawals and sweeps that are stuck in 'broadcast' status
 * past the configured age thresholds.
 *
 * Returns at most 100 items (ops-visible limit per spec).
 */
export async function listStuckTxs(db: Db, config: ScanConfig): Promise<StuckScanResult> {
  const { evmStuckMinutes, solanaStuckSeconds, maxBumps } = config;

  const evmCutoff = new Date(Date.now() - evmStuckMinutes * 60 * 1_000);
  const solanaCutoff = new Date(Date.now() - solanaStuckSeconds * 1_000);

  // ── Stuck withdrawals (status='broadcast') ────────────────────────────────
  const stuckWithdrawals = await db
    .select()
    .from(schema.withdrawals)
    .where(
      and(
        eq(schema.withdrawals.status, 'broadcast'),
        or(
          // EVM: bnb chain past evmCutoff
          and(eq(schema.withdrawals.chain, 'bnb'), lt(schema.withdrawals.broadcastAt, evmCutoff)),
          // Solana: sol chain past solanaCutoff
          and(eq(schema.withdrawals.chain, 'sol'), lt(schema.withdrawals.broadcastAt, solanaCutoff))
        )
      )
    )
    .limit(50);

  // ── Stuck sweeps (status='submitted' — existing sweep status for in-flight) ──
  const stuckSweeps = await db
    .select()
    .from(schema.sweeps)
    .where(
      and(
        // Sweeps use 'submitted' as the in-flight status in the existing enum
        eq(schema.sweeps.status, 'submitted'),
        or(
          and(eq(schema.sweeps.chain, 'bnb'), lt(schema.sweeps.broadcastAt, evmCutoff)),
          and(eq(schema.sweeps.chain, 'sol'), lt(schema.sweeps.broadcastAt, solanaCutoff))
        )
      )
    )
    .limit(50);

  const now = Date.now();

  // ── Map withdrawals to StuckTxItem ────────────────────────────────────────
  // Pre-filter guarantees txHash and broadcastAt are non-null; destructure to narrow types
  type WithdrawalWithBroadcast = (typeof stuckWithdrawals)[number] & {
    txHash: string;
    broadcastAt: Date;
  };
  const withdrawalItems: StuckTxItem[] = stuckWithdrawals
    .filter((w): w is WithdrawalWithBroadcast => w.txHash != null && w.broadcastAt != null)
    .map((w) => {
      const ageSeconds = Math.floor((now - w.broadcastAt.getTime()) / 1_000);
      const isCold = w.sourceTier === 'cold';
      const isSolana = w.chain === 'sol';
      // Cold-tier bump forbidden per spec; canBump=false lets UI show disabled state
      const canBump = !isCold && w.bumpCount < maxBumps;
      // Cancel: EVM only, not cold, not already cancelling/cancelled
      const canCancel =
        !isSolana && !isCold && w.status !== 'cancelling' && w.status !== 'cancelled';

      return {
        entityType: 'withdrawal' as const,
        entityId: w.id,
        chain: w.chain,
        txHash: w.txHash,
        broadcastAt: w.broadcastAt.toISOString(),
        ageSeconds,
        bumpCount: w.bumpCount,
        lastBumpAt: w.lastBumpAt?.toISOString() ?? null,
        canBump,
        canCancel,
      };
    });

  // ── Map sweeps to StuckTxItem ─────────────────────────────────────────────
  type SweepWithBroadcast = (typeof stuckSweeps)[number] & {
    txHash: string;
    broadcastAt: Date;
  };
  const sweepItems: StuckTxItem[] = stuckSweeps
    .filter((s): s is SweepWithBroadcast => s.txHash != null && s.broadcastAt != null)
    .map((s) => {
      const ageSeconds = Math.floor((now - s.broadcastAt.getTime()) / 1_000);
      const isSolana = s.chain === 'sol';
      const canBump = s.bumpCount < maxBumps;
      // Cancel: EVM only (sweeps have no 'cancelled' status — 'confirmed'/'failed' are terminal)
      const canCancel = !isSolana && s.status !== 'confirmed' && s.status !== 'failed';

      return {
        entityType: 'sweep' as const,
        entityId: s.id,
        chain: s.chain,
        txHash: s.txHash,
        broadcastAt: s.broadcastAt.toISOString(),
        ageSeconds,
        bumpCount: s.bumpCount,
        lastBumpAt: s.lastBumpAt?.toISOString() ?? null,
        canBump,
        canCancel,
      };
    });

  // Merge and sort by age descending (oldest stuck first), cap at 100
  const items = [...withdrawalItems, ...sweepItems]
    .sort((a, b) => b.ageSeconds - a.ageSeconds)
    .slice(0, 100);

  return {
    items,
    thresholdsUsed: { evmMinutes: evmStuckMinutes, solanaSeconds: solanaStuckSeconds },
  };
}
