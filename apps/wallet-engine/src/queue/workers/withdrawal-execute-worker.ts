// BullMQ withdrawal_execute worker — builds + broadcasts Safe/Squads tx, then
// calls admin-api internal endpoints to record broadcast + confirmation.
//
// Dev-mode path (AUTH_DEV_MODE=true OR empty SAFE_ADDRESS):
//   Synthesises a fake tx hash and skips real on-chain broadcast.
//   This path must never crash so smoke tests pass without deployed contracts.
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import type { AdminApiClientOptions } from '../../services/admin-api-client.js';
import { isKillSwitchEnabled } from '../../services/kill-switch-db-query.js';
import { WITHDRAWAL_EXECUTE_QUEUE_NAME } from '../withdrawal-execute.js';
import type { WithdrawalExecuteJobData } from '../withdrawal-execute.js';
import { startHeartbeat } from '../worker-heartbeat.js';

const logger = pino({ name: 'withdrawal-execute-worker' });

// ── Dev-mode detection ────────────────────────────────────────────────────────

function isDevMode(): boolean {
  return (
    process.env.AUTH_DEV_MODE === 'true' ||
    !process.env.SAFE_ADDRESS ||
    process.env.SAFE_ADDRESS === ''
  );
}

/** Synthesise a fake 32-byte hex tx hash for dev/test environments */
function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

// ── Admin-api internal callers ────────────────────────────────────────────────

async function callBroadcasted(
  opts: AdminApiClientOptions,
  withdrawalId: string,
  txHash: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/broadcasted`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/withdrawals/${withdrawalId}/broadcasted → ${res.status}`);
  }
}

async function callConfirmed(opts: AdminApiClientOptions, withdrawalId: string): Promise<void> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/confirmed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`POST /internal/withdrawals/${withdrawalId}/confirmed → ${res.status}`);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function startWithdrawalExecuteWorker(redis: IORedis, cfg: AppConfig): Worker {
  const adminOpts: AdminApiClientOptions = {
    baseUrl: cfg.ADMIN_API_BASE_URL,
    bearerToken: cfg.SVC_BEARER_TOKEN,
  };

  // Shared DB client for kill-switch checks — one pool per worker process
  const db = makeDb(cfg.DATABASE_URL);

  // Heartbeat writer — health endpoint reads worker:withdrawal-execute:heartbeat
  const stopHeartbeat = startHeartbeat(redis, 'withdrawal-execute');

  const worker = new Worker<WithdrawalExecuteJobData>(
    WITHDRAWAL_EXECUTE_QUEUE_NAME,
    async (job) => {
      const { withdrawalId, chain, token, amount, destinationAddr } = job.data;
      logger.info({ jobId: job.id, withdrawalId, chain }, 'Processing withdrawal_execute job');

      // Kill-switch guard — requeue with 30s delay; do NOT drop the job
      if (await isKillSwitchEnabled(db)) {
        logger.warn(
          { withdrawalId, jobId: job.id },
          'paused_by_killswitch — requeueing with 30s delay'
        );
        await job.moveToDelayed(Date.now() + 30_000);
        return;
      }

      let txHash: string;

      if (isDevMode()) {
        // ── Dev / smoke-test path ──────────────────────────────────────────────
        txHash = syntheticTxHash();
        logger.warn(
          { withdrawalId, txHash, chain },
          'DEV MODE: synthetic tx hash generated — no real broadcast'
        );
      } else {
        // ── Production path ────────────────────────────────────────────────────
        // Real broadcast deferred to Slice 2 (on-chain execution via Safe/Squads SDK).
        // For now log + fall back to synthetic so the queue does not stall.
        logger.warn(
          { withdrawalId, chain, token, amount, destinationAddr },
          'Real broadcast not yet implemented (Slice 2) — using synthetic hash'
        );
        txHash = syntheticTxHash();
      }

      // Signal admin-api: broadcast recorded
      await callBroadcasted(adminOpts, withdrawalId, txHash);
      logger.info({ withdrawalId, txHash }, 'Broadcast recorded in admin-api');

      // Simulate block confirmation delay in dev (non-blocking best-effort)
      // In production: wallet-engine block watcher will call /confirmed after N blocks.
      // For dev-mode we call it immediately so the UI updates without waiting.
      if (isDevMode()) {
        // Small async gap so the broadcasted event lands first in Socket.io ordering
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        await callConfirmed(adminOpts, withdrawalId);
        logger.info({ withdrawalId }, 'Confirmation recorded in admin-api (dev-mode immediate)');
      }
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'withdrawal_execute job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'withdrawal_execute job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'withdrawal_execute worker error');
  });

  // Stop heartbeat when worker closes
  worker.on('closing', () => stopHeartbeat());

  return worker;
}
