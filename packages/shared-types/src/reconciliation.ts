// Reconciliation shared types — used by admin-api routes and UI API client
import { z } from 'zod';

// ── Snapshot ──────────────────────────────────────────────────────────────────

export const SnapshotStatus = z.enum(['running', 'completed', 'failed', 'cancelled']);
export type SnapshotStatus = z.infer<typeof SnapshotStatus>;

export const SnapshotScope = z.enum(['all', 'hot', 'cold', 'users']);
export type SnapshotScope = z.infer<typeof SnapshotScope>;

export const ReconciliationSnapshot = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  status: SnapshotStatus,
  chain: z.string().nullable(),
  scope: SnapshotScope,
  onChainTotalMinor: z.string().nullable(),
  ledgerTotalMinor: z.string().nullable(),
  driftTotalMinor: z.string().nullable(),
  errorMessage: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type ReconciliationSnapshot = z.infer<typeof ReconciliationSnapshot>;

// ── Drift ─────────────────────────────────────────────────────────────────────

export const DriftSeverity = z.enum(['info', 'warning', 'critical']);
export type DriftSeverity = z.infer<typeof DriftSeverity>;

export const ReconciliationDrift = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
  chain: z.string(),
  token: z.string(),
  address: z.string(),
  accountLabel: z.string(),
  onChainMinor: z.string(),
  ledgerMinor: z.string(),
  driftMinor: z.string(),
  severity: DriftSeverity,
  suppressedReason: z.string().nullable(),
  createdAt: z.string(),
});
export type ReconciliationDrift = z.infer<typeof ReconciliationDrift>;

// ── API payloads ──────────────────────────────────────────────────────────────

export const RunSnapshotBody = z.object({
  chain: z.enum(['bnb', 'sol']).optional(),
  scope: SnapshotScope.optional(),
});
export type RunSnapshotBody = z.infer<typeof RunSnapshotBody>;

export const SnapshotListResponse = z.object({
  data: z.array(ReconciliationSnapshot),
  total: z.number().int(),
  page: z.number().int(),
});
export type SnapshotListResponse = z.infer<typeof SnapshotListResponse>;

export const SnapshotDetailResponse = z.object({
  snapshot: ReconciliationSnapshot,
  drifts: z.array(ReconciliationDrift),
});
export type SnapshotDetailResponse = z.infer<typeof SnapshotDetailResponse>;
