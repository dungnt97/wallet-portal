// Recovery domain types — shared between admin-api and UI
// Covers stuck-tx detection results, bump/cancel request/response shapes.
import { z } from 'zod';
import { Chain } from './primitives.js';

// ── Enums ────────────────────────────────────────────────────────────────────

export const RecoveryEntityType = z.enum(['withdrawal', 'sweep']);
export type RecoveryEntityType = z.infer<typeof RecoveryEntityType>;

export const RecoveryActionType = z.enum(['bump', 'cancel']);
export type RecoveryActionType = z.infer<typeof RecoveryActionType>;

export const RecoveryActionStatus = z.enum(['pending', 'broadcast', 'confirmed', 'failed']);
export type RecoveryActionStatus = z.infer<typeof RecoveryActionStatus>;

// ── Stuck-tx item ────────────────────────────────────────────────────────────

/** One row returned by GET /recovery/stuck */
export const StuckTxItem = z.object({
  entityType: RecoveryEntityType,
  entityId: z.string().uuid(),
  chain: Chain,
  /** Current (stuck) tx hash on-chain */
  txHash: z.string(),
  /** When the tx was broadcast */
  broadcastAt: z.string().datetime(),
  /** Age in seconds since broadcast */
  ageSeconds: z.number().int(),
  /** Number of bump operations already applied */
  bumpCount: z.number().int(),
  /** ISO timestamp of the most recent bump, or null */
  lastBumpAt: z.string().datetime().nullable(),
  /** True when bump is permitted (chain supports it + not cold tier + bump_count < max) */
  canBump: z.boolean(),
  /** True when cancel is permitted (EVM only, not already cancelling/cancelled) */
  canCancel: z.boolean(),
});
export type StuckTxItem = z.infer<typeof StuckTxItem>;

/** Response body for GET /recovery/stuck */
export const StuckTxListResponse = z.object({
  items: z.array(StuckTxItem),
  thresholdsUsed: z.object({
    evmMinutes: z.number(),
    solanaSeconds: z.number(),
  }),
});
export type StuckTxListResponse = z.infer<typeof StuckTxListResponse>;

// ── Bump request/response ────────────────────────────────────────────────────

export const BumpTxRequest = z.object({
  idempotencyKey: z.string().min(1).max(128),
});
export type BumpTxRequest = z.infer<typeof BumpTxRequest>;

export const BumpTxResponse = z.object({
  ok: z.literal(true),
  actionId: z.string().uuid(),
  newTxHash: z.string(),
  bumpCount: z.number().int(),
});
export type BumpTxResponse = z.infer<typeof BumpTxResponse>;

// ── Cancel request/response ──────────────────────────────────────────────────

export const CancelTxRequest = z.object({
  idempotencyKey: z.string().min(1).max(128),
});
export type CancelTxRequest = z.infer<typeof CancelTxRequest>;

export const CancelTxResponse = z.object({
  ok: z.literal(true),
  actionId: z.string().uuid(),
  cancelTxHash: z.string(),
});
export type CancelTxResponse = z.infer<typeof CancelTxResponse>;

// ── Recovery action row (read-back) ──────────────────────────────────────────

export const RecoveryAction = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string(),
  actionType: RecoveryActionType,
  entityType: RecoveryEntityType,
  entityId: z.string().uuid(),
  chain: Chain,
  originalTxHash: z.string(),
  newTxHash: z.string().nullable(),
  gasPriceGwei: z.string().nullable(),
  status: RecoveryActionStatus,
  initiatedBy: z.string().uuid(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
});
export type RecoveryAction = z.infer<typeof RecoveryAction>;
