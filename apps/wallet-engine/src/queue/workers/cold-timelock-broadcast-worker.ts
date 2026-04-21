// BullMQ worker — fires when a cold withdrawal's timelock expires.
//
// Safety checklist (all run inside SELECT ... FOR UPDATE equivalent via admin-api HTTP):
//  1. Status is 'time_locked' or 'approved' (not cancelled / already executing).
//  2. collected_sigs >= required_sigs (threshold met).
//  3. kill-switch is OFF.
//  4. time_lock_expires_at <= now() (not jumped ahead by a clock skew).
//
// If conditions pass: calls admin-api POST /internal/withdrawals/:id/execute
//   which transitions status → executing and enqueues the withdrawal_execute job.
// If sigs not yet collected: leave in time_locked; a future approval will re-check.
// If kill-switch enabled: moveToDelayed 30s (matches withdrawal-execute-worker pattern).
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import { isKillSwitchEnabled } from '../../services/kill-switch-db-query.js';
import { startHeartbeat } from '../worker-heartbeat.js';

const logger = pino({ name: 'cold-timelock-broadcast-worker' });

export const COLD_TIMELOCK_QUEUE_NAME = 'cold_timelock_broadcast';

export interface ColdTimelockJobData {
  withdrawalId: string;
}

// ── Admin-api internal callers ────────────────────────────────────────────────

interface AdminOpts {
  baseUrl: string;
  bearerToken: string;
}

async function fetchWithdrawal(
  opts: AdminOpts,
  withdrawalId: string
): Promise<{
  id: string;
  status: string;
  sourceTier: string;
  multisigOpId: string | null;
  timeLockExpiresAt: string | null;
  collectedSigs?: number;
  requiredSigs?: number;
} | null> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.bearerToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /internal/withdrawals/${withdrawalId} → ${res.status}`);
  return (await res.json()) as {
    id: string;
    status: string;
    sourceTier: string;
    multisigOpId: string | null;
    timeLockExpiresAt: string | null;
    collectedSigs?: number;
    requiredSigs?: number;
  };
}

async function callExecute(opts: AdminOpts, withdrawalId: string): Promise<void> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/execute`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`POST /internal/withdrawals/${withdrawalId}/execute → ${res.status}`);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function startColdTimelockBroadcastWorker(redis: IORedis, cfg: AppConfig): Worker {
  const adminOpts: AdminOpts = {
    baseUrl: cfg.ADMIN_API_BASE_URL,
    bearerToken: cfg.SVC_BEARER_TOKEN,
  };

  const db = makeDb(cfg.DATABASE_URL);
  const stopHeartbeat = startHeartbeat(redis, 'cold-timelock-broadcast');

  const worker = new Worker<ColdTimelockJobData>(
    COLD_TIMELOCK_QUEUE_NAME,
    async (job) => {
      const { withdrawalId } = job.data;
      logger.info({ jobId: job.id, withdrawalId }, 'Processing cold-timelock-broadcast job');

      // Kill-switch guard — requeue with 30s delay
      if (await isKillSwitchEnabled(db)) {
        logger.warn({ withdrawalId, jobId: job.id }, 'kill_switch_on — requeueing with 30s delay');
        await job.moveToDelayed(Date.now() + 30_000);
        return;
      }

      // Fetch withdrawal state from admin-api (authoritative source)
      const withdrawal = await fetchWithdrawal(adminOpts, withdrawalId);
      if (!withdrawal) {
        logger.warn({ withdrawalId }, 'Withdrawal not found — discarding job');
        return;
      }

      // Status guard: only broadcast if still time_locked or approved
      if (!['time_locked', 'approved'].includes(withdrawal.status)) {
        logger.info(
          { withdrawalId, status: withdrawal.status },
          'Withdrawal not in broadcastable state — skipping'
        );
        return;
      }

      // Timelock expiry check (defence-in-depth against clock skew)
      if (withdrawal.timeLockExpiresAt) {
        const expiresAt = new Date(withdrawal.timeLockExpiresAt);
        if (expiresAt > new Date()) {
          const msRemaining = expiresAt.getTime() - Date.now();
          logger.warn(
            { withdrawalId, msRemaining },
            'Timelock not yet expired — requeueing with remaining delay'
          );
          await job.moveToDelayed(Date.now() + msRemaining + 1_000);
          return;
        }
      }

      // Signature threshold check — don't broadcast if sigs not yet collected
      const collectedSigs = withdrawal.collectedSigs ?? 0;
      const requiredSigs = withdrawal.requiredSigs ?? 2;
      if (collectedSigs < requiredSigs) {
        logger.info(
          { withdrawalId, collectedSigs, requiredSigs },
          'Signature threshold not met — leaving in time_locked; approval will trigger broadcast'
        );
        return;
      }

      // All checks passed — trigger execute via admin-api internal endpoint
      await callExecute(adminOpts, withdrawalId);
      logger.info({ withdrawalId }, 'Cold timelock broadcast triggered via admin-api');
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'cold-timelock-broadcast job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'cold-timelock-broadcast job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'cold-timelock-broadcast worker error');
  });

  worker.on('closing', () => stopHeartbeat());

  return worker;
}
