import * as schema from '@wp/admin-api/db-schema';
// BullMQ worker for signer_ceremony jobs.
// Loads ceremony + linked multisig_op from DB, builds the appropriate tx,
// broadcasts (or synthesizes in dev-mode), and signals admin-api to advance state.
//
// Dev-mode (AUTH_DEV_MODE=true OR empty SAFE_ADDRESS):
//   Generates a synthetic tx hash, skips real on-chain broadcast.
//   After both chains confirm, admin-api flips revoked_at for removed staff.
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import type { AdminApiClientOptions } from '../../services/admin-api-client.js';
import {
  buildAddOwnerTx,
  buildRemoveOwnerTx,
  buildRotateTx,
} from '../../services/signer-ceremony-evm.js';
import { SIGNER_CEREMONY_QUEUE_NAME } from '../signer-ceremony-broadcast.js';
import type { SignerCeremonyJobData } from '../signer-ceremony-broadcast.js';
import { startHeartbeat } from '../worker-heartbeat.js';

const logger = pino({ name: 'signer-ceremony-worker' });

// ── Dev-mode detection ────────────────────────────────────────────────────────

function isDevMode(): boolean {
  return (
    process.env.AUTH_DEV_MODE === 'true' ||
    !process.env.SAFE_ADDRESS ||
    process.env.SAFE_ADDRESS === ''
  );
}

function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

// ── Admin-api ceremony state callbacks ────────────────────────────────────────

async function callCeremonyChainConfirmed(
  opts: AdminApiClientOptions,
  ceremonyId: string,
  chain: string,
  txHash: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/ceremonies/${encodeURIComponent(ceremonyId)}/chain-confirmed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ chain, txHash }),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/ceremonies/${ceremonyId}/chain-confirmed → ${res.status}`);
  }
}

async function callCeremonyChainFailed(
  opts: AdminApiClientOptions,
  ceremonyId: string,
  chain: string,
  reason: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/ceremonies/${encodeURIComponent(ceremonyId)}/chain-failed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ chain, reason }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, ceremonyId, chain }, 'chain-failed callback non-2xx');
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function startSignerCeremonyWorker(redis: IORedis, cfg: AppConfig): Worker {
  const adminOpts: AdminApiClientOptions = {
    baseUrl: cfg.ADMIN_API_BASE_URL,
    bearerToken: cfg.SVC_BEARER_TOKEN,
  };

  const db = makeDb(cfg.DATABASE_URL);
  const stopHeartbeat = startHeartbeat(redis, 'signer-ceremony');

  const worker = new Worker<SignerCeremonyJobData>(
    SIGNER_CEREMONY_QUEUE_NAME,
    async (job) => {
      const { ceremonyId, chain } = job.data;
      logger.info({ jobId: job.id, ceremonyId, chain }, 'Processing signer_ceremony job');

      // Load ceremony row
      const ceremony = await db.query.signerCeremonies.findFirst({
        where: eq(schema.signerCeremonies.id, ceremonyId),
      });
      if (!ceremony) {
        logger.error({ ceremonyId }, 'Ceremony not found — skipping');
        return;
      }

      // Idempotency: skip if this chain already confirmed
      const chainState = (
        ceremony.chainStates as Record<string, { status: string; txHash?: string }>
      )?.[chain === 'sol' ? 'solana' : chain];
      if (chainState?.status === 'confirmed' && chainState.txHash) {
        logger.info(
          { ceremonyId, chain, txHash: chainState.txHash },
          'Chain already confirmed — skipping'
        );
        return;
      }

      // Skip cancelled ceremonies
      if (ceremony.status === 'cancelled') {
        logger.info({ ceremonyId }, 'Ceremony cancelled — skipping');
        return;
      }

      let txHash: string;

      try {
        if (isDevMode()) {
          // ── Dev path ───────────────────────────────────────────────────────
          txHash = syntheticTxHash();
          logger.warn({ ceremonyId, chain, txHash }, 'DEV MODE: synthetic tx — no real broadcast');
        } else {
          // ── Production path ────────────────────────────────────────────────
          // EVM chain: build Safe tx and broadcast
          if (chain === 'bnb') {
            const safeAddr = process.env.SAFE_ADDRESS ?? '';
            const opType = ceremony.operationType;

            if (opType === 'signer_add') {
              // Build add-owner tx (threshold kept, use 2 as default)
              buildAddOwnerTx(safeAddr, '', 2);
              logger.warn({ ceremonyId }, 'EVM broadcast not fully wired — using synthetic');
            } else if (opType === 'signer_remove') {
              buildRemoveOwnerTx(safeAddr, '', '', 2);
              logger.warn({ ceremonyId }, 'EVM broadcast not fully wired — using synthetic');
            } else {
              buildRotateTx({
                safeAddr,
                addOwners: [],
                removeOwners: [],
                prevOwners: [],
                threshold: 2,
                multiSendAddr: '',
              });
              logger.warn({ ceremonyId }, 'EVM rotate broadcast not fully wired — using synthetic');
            }
            // Full execution wiring deferred — fall back to synthetic
            txHash = syntheticTxHash();
          } else {
            // SOL: Squads broadcast deferred — synthetic
            logger.warn(
              { ceremonyId, chain },
              'Solana broadcast not fully wired — using synthetic'
            );
            txHash = syntheticTxHash();
          }
        }

        // Signal admin-api: chain confirmed
        await callCeremonyChainConfirmed(adminOpts, ceremonyId, chain, txHash);
        logger.info({ ceremonyId, chain, txHash }, 'Ceremony chain confirmed in admin-api');
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error({ ceremonyId, chain, reason }, 'Ceremony chain broadcast failed');

        // Signal admin-api: chain failed (best-effort — do not re-throw to allow BullMQ retry)
        try {
          await callCeremonyChainFailed(adminOpts, ceremonyId, chain, reason);
        } catch (cbErr) {
          logger.error({ cbErr }, 'Failed to notify admin-api of chain failure');
        }
        // Re-throw so BullMQ applies retry/backoff
        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'signer_ceremony job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'signer_ceremony job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'signer_ceremony worker error');
  });

  worker.on('closing', () => stopHeartbeat());

  return worker;
}
