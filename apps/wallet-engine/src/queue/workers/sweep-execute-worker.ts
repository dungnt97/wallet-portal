import { PublicKey } from '@solana/web3.js';
// BullMQ sweep_execute worker — derives HD key, builds + signs + broadcasts sweep tx,
// then calls admin-api internal endpoints to record broadcast + confirmation.
//
// Flow per job:
//  1. Policy check → confirm destination is hot_safe (fail-closed)
//  2. Route by chain → sweep-evm.ts or sweep-solana.ts
//  3. Dev-mode: synthetic broadcast + 500ms confirm (mirrors withdrawal-execute-worker)
//  4. POST admin-api /internal/sweeps/:id/broadcasted
//  5. POST admin-api /internal/sweeps/:id/confirmed
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import type { BnbPool } from '../../rpc/bnb-pool.js';
import type { SolanaPool } from '../../rpc/solana-pool.js';
import type { AdminApiClientOptions } from '../../services/admin-api-client.js';
import { isKillSwitchEnabled } from '../../services/kill-switch-db-query.js';
import { broadcastSweepEVM, buildAndSignSweepEVM } from '../../services/sweep-evm.js';
import { broadcastSweepSolana, buildAndSignSweepSolana } from '../../services/sweep-solana.js';
import { SWEEP_EXECUTE_QUEUE_NAME, type SweepExecuteJobData } from '../sweep-execute.js';

const logger = pino({ name: 'sweep-execute-worker' });

// ── Dev-mode detection ────────────────────────────────────────────────────────

function isDevMode(): boolean {
  return (
    process.env.AUTH_DEV_MODE === 'true' ||
    !process.env.HD_MASTER_XPUB_BNB ||
    process.env.HD_MASTER_XPUB_BNB === ''
  );
}

/** Synthesise a fake 32-byte hex tx hash */
function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

// ── Policy check (fail-closed) ────────────────────────────────────────────────

interface PolicyCheckResult {
  allow: boolean;
  reason?: string;
}

async function checkSweepPolicy(
  policyBaseUrl: string,
  bearerToken: string,
  data: SweepExecuteJobData
): Promise<PolicyCheckResult> {
  const url = `${policyBaseUrl}/v1/check`;
  const body = {
    operation_type: 'sweep',
    actor_staff_id: '',
    destination_addr: data.destinationHotSafe,
    amount: data.amount,
    chain: data.chain,
    tier: 'hot',
    signer_address: '',
    withdrawal_id: '',
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Network error or timeout — fail closed
    logger.warn({ sweepId: data.sweepId }, 'Policy Engine unreachable — failing closed');
    return { allow: false, reason: 'policy_engine_unavailable' };
  }

  if (!response.ok) {
    logger.warn({ sweepId: data.sweepId, status: response.status }, 'Policy Engine non-2xx');
    return { allow: false, reason: `policy_engine_error_${response.status}` };
  }

  const raw = (await response.json()) as { Allow?: boolean; allow?: boolean };
  const allow = raw.allow ?? raw.Allow ?? false;
  return { allow };
}

// ── Admin-api internal callers ────────────────────────────────────────────────

async function callSweepBroadcasted(
  opts: AdminApiClientOptions,
  sweepId: string,
  txHash: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/sweeps/${encodeURIComponent(sweepId)}/broadcasted`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/sweeps/${sweepId}/broadcasted → ${res.status}`);
  }
}

async function callSweepConfirmed(opts: AdminApiClientOptions, sweepId: string): Promise<void> {
  const url = `${opts.baseUrl}/internal/sweeps/${encodeURIComponent(sweepId)}/confirmed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`POST /internal/sweeps/${sweepId}/confirmed → ${res.status}`);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export interface SweepWorkerDeps {
  bnbPool: BnbPool;
  solPool: SolanaPool;
}

export function startSweepExecuteWorker(
  redis: IORedis,
  cfg: AppConfig,
  deps: SweepWorkerDeps
): Worker {
  const adminOpts: AdminApiClientOptions = {
    baseUrl: cfg.ADMIN_API_BASE_URL,
    bearerToken: cfg.SVC_BEARER_TOKEN,
  };

  // Shared DB client for kill-switch checks — one pool per worker process
  const db = makeDb(cfg.DATABASE_URL);

  const worker = new Worker<SweepExecuteJobData>(
    SWEEP_EXECUTE_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      const { sweepId, chain, token, amount, fromAddr, destinationHotSafe, derivationIndex } = data;

      logger.info({ jobId: job.id, sweepId, chain }, 'Processing sweep_execute job');

      // Kill-switch guard — requeue with 30s delay; do NOT drop the job
      if (await isKillSwitchEnabled(db)) {
        logger.warn({ sweepId, jobId: job.id }, 'paused_by_killswitch — requeueing with 30s delay');
        await job.moveToDelayed(Date.now() + 30_000);
        return;
      }

      // ── Policy check ────────────────────────────────────────────────────────
      if (!isDevMode()) {
        const policy = await checkSweepPolicy(
          cfg.POLICY_ENGINE_BASE_URL,
          cfg.SVC_BEARER_TOKEN,
          data
        );
        if (!policy.allow) {
          throw new Error(
            `Sweep ${sweepId} rejected by policy engine: ${policy.reason ?? 'denied'}`
          );
        }
      }

      let txHash: string;

      if (isDevMode()) {
        // ── Dev/smoke-test path ───────────────────────────────────────────────
        txHash = syntheticTxHash();
        logger.warn({ sweepId, txHash, chain }, 'DEV MODE: synthetic tx hash — no real broadcast');
      } else if (chain === 'bnb') {
        // ── EVM path ─────────────────────────────────────────────────────────
        const tokenContract = (
          token === 'USDT' ? cfg.USDT_BNB_ADDRESS : cfg.USDC_BNB_ADDRESS
        ) as `0x${string}`;

        // Fetch current nonce for the from-address
        const nonce = await deps.bnbPool.provider.getTransactionCount(fromAddr, 'pending');

        const signed = await buildAndSignSweepEVM({
          userAddressIndex: derivationIndex,
          token,
          tokenContract,
          amount: BigInt(Math.floor(Number(amount) * 1e18)), // parse decimal string to wei
          destinationHotSafe: destinationHotSafe as `0x${string}`,
          nonce,
        });

        // Use first provider from the pool for broadcast
        const firstProvider = deps.bnbPool.provider.providerConfigs[0]?.provider;
        if (!firstProvider) throw new Error('No BNB provider available for broadcast');

        const result = await broadcastSweepEVM(
          signed.txHex,
          firstProvider as Parameters<typeof broadcastSweepEVM>[1]
        );
        txHash = result.txHash;
      } else {
        // ── Solana path ───────────────────────────────────────────────────────
        const mintAddress = token === 'USDT' ? cfg.USDT_SOL_MINT : cfg.USDC_SOL_MINT;
        const mint = new PublicKey(mintAddress);
        const dest = new PublicKey(destinationHotSafe);

        const blockhash = (await deps.solPool.primary.getRecentBlockhash('confirmed')).blockhash;

        const signed = await buildAndSignSweepSolana(
          {
            userAddressIndex: derivationIndex,
            mint,
            // Solana USDT/USDC use 6 decimals
            amount: BigInt(Math.floor(Number(amount) * 1e6)),
            destinationHotSafe: dest,
          },
          blockhash
        );

        const result = await broadcastSweepSolana(signed.txBase64, deps.solPool.primary);
        txHash = result.signature;
      }

      // ── Notify admin-api: broadcast ────────────────────────────────────────
      await callSweepBroadcasted(adminOpts, sweepId, txHash);
      logger.info({ sweepId, txHash }, 'Sweep broadcast recorded in admin-api');

      // ── Confirmation ───────────────────────────────────────────────────────
      // Dev-mode: immediate confirm after 500ms (mirrors withdrawal-execute-worker)
      // Prod: block watcher calls /confirmed after N confirmations (Slice 3)
      if (isDevMode()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        await callSweepConfirmed(adminOpts, sweepId);
        logger.info({ sweepId }, 'Sweep confirmation recorded in admin-api (dev-mode)');
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'sweep_execute job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'sweep_execute job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'sweep_execute worker error');
  });

  return worker;
}
