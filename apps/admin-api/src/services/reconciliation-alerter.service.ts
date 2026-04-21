// reconciliation-alerter.service — fires notifyStaff after a snapshot completes.
//
// Rules:
//   - Any critical drift → severity='critical', audience=ops+admins, Slack included
//   - Any warning drift (no critical) → severity='warning', audience=ops+admins
//   - Zero non-suppressed drifts above warning → severity='info', audience=admins only
//
// Deduplication: dedupeKey=snapshotId prevents duplicate rows per staff for a single run.
// Alerting is aggregate (one notification per snapshot), never per-drift-row.
//
// RECON_ENABLED=false or NOTIFICATIONS_ENABLED=false → both are no-ops already.
import type { Queue } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import type { EmailJobData, SlackJobData } from './notify-staff.service.js';
import { notifyStaff } from './notify-staff.service.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface AlertInput {
  snapshotId: string;
  driftCount: number;
  criticalCount: number;
  warningCount: number;
  driftTotalMinor: bigint;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fire a single aggregate notification for the completed snapshot.
 * Called by the snapshot service after the snapshot is marked completed.
 * Non-fatal — exceptions are logged but not rethrown.
 */
export async function alertOnSnapshotComplete(
  db: Db,
  io: SocketIOServer,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>,
  input: AlertInput
): Promise<void> {
  const { snapshotId, driftCount, criticalCount, warningCount, driftTotalMinor } = input;

  const payload = {
    snapshotId,
    driftCount,
    criticalCount,
    warningCount,
    totalDriftMinor: driftTotalMinor.toString(),
  };

  try {
    if (criticalCount > 0) {
      // Critical drift — notify ops + admins (admins are always added for critical by notifyStaff)
      await notifyStaff(
        db,
        io,
        {
          role: 'operator',
          eventType: 'reconciliation.drift.critical',
          severity: 'critical',
          title: `Reconciliation: ${criticalCount} critical drift(s) detected`,
          body: buildBody(input),
          payload,
          dedupeKey: snapshotId,
        },
        emailQueue,
        slackQueue
      );
      return;
    }

    if (warningCount > 0) {
      // Warning-only — notify ops + admins at warning severity
      await notifyStaff(
        db,
        io,
        {
          role: 'operator',
          eventType: 'reconciliation.drift.warning',
          severity: 'warning',
          title: `Reconciliation: ${warningCount} warning drift(s) detected`,
          body: buildBody(input),
          payload,
          dedupeKey: snapshotId,
        },
        emailQueue,
        slackQueue
      );
      return;
    }

    // Zero drifts above warning — info to admins only
    await notifyStaff(
      db,
      io,
      {
        role: 'admin',
        eventType: 'reconciliation.drift.none',
        severity: 'info',
        title: 'Reconciliation: no significant drift detected',
        body: `Snapshot ${snapshotId} completed. ${driftCount} info-level drift(s) found, none above warning threshold.`,
        payload,
        dedupeKey: snapshotId,
      },
      emailQueue,
      slackQueue
    );
  } catch (err) {
    // Non-fatal — alerting failure must not affect snapshot data integrity
    console.error('[recon-alerter] failed to send alert for snapshot %s: %s', snapshotId, err);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildBody(input: AlertInput): string {
  const { snapshotId, criticalCount, warningCount, driftCount, driftTotalMinor } = input;
  const parts: string[] = [`Snapshot ID: ${snapshotId}`];
  if (criticalCount > 0) parts.push(`Critical: ${criticalCount}`);
  if (warningCount > 0) parts.push(`Warning: ${warningCount}`);
  parts.push(`Total drift rows: ${driftCount}`);
  parts.push(`Net drift (minor units): ${driftTotalMinor.toString()}`);
  return parts.join(' | ');
}
