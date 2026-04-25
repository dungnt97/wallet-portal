import { PublicKey } from '@solana/web3.js';
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
import { startHeartbeat } from '../worker-heartbeat.js';
import { callSweepBroadcasted, callSweepConfirmed } from './sweep-admin-notifier.js';
import { checkSweepPolicy } from './sweep-policy-check.js';

const logger = pino({ name: 'sweep-execute-worker' });

// ── Dev-mode detection ────────────────────────────────────────────────────────

function isDevMode(chain: 'bnb' | 'sol'): boolean {
  if (chain === 'sol') {
    const seed = process.env.HD_MASTER_SEED_SOLANA;
    return !seed || seed === '' || seed === 'your-hex-encoded-seed-here';
  }
  return !process.env.HD_MASTER_XPUB_BNB || process.env.HD_MASTER_XPUB_BNB === '';
}

function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
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

  const db = makeDb(cfg.DATABASE_URL);
  const stopHeartbeat = startHeartbeat(redis, 'sweep-execute');

  // Per-address mutex to prevent nonce collisions when multiple sweeps target the same fromAddr
  const addressLocks = new Map<string, Promise<void>>();
  function withAddressLock<T>(addr: string, fn: () => Promise<T>): Promise<T> {
    const prev = addressLocks.get(addr) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    addressLocks.set(
      addr,
      next.then(
        () => {},
        () => {}
      )
    );
    return next;
  }

  const worker = new Worker<SweepExecuteJobData>(
    SWEEP_EXECUTE_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      const { sweepId, chain, token, amount, fromAddr, destinationHotSafe, derivationIndex } = data;

      logger.info({ jobId: job.id, sweepId, chain }, 'Processing sweep_execute job');

      return withAddressLock(fromAddr, async () => {
        if (await isKillSwitchEnabled(db)) {
          logger.warn(
            { sweepId, jobId: job.id },
            'paused_by_killswitch — requeueing with 30s delay'
          );
          await job.moveToDelayed(Date.now() + 30_000);
          return;
        }

        // Policy check (skip when no policy engine configured or in dev mode)
        if (
          !isDevMode(chain) &&
          cfg.POLICY_ENGINE_BASE_URL &&
          !cfg.POLICY_ENGINE_BASE_URL.includes('localhost')
        ) {
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

        if (isDevMode(chain)) {
          txHash = syntheticTxHash();
          logger.warn(
            { sweepId, txHash, chain },
            'DEV MODE: synthetic tx hash — no real broadcast'
          );
        } else if (chain === 'bnb') {
          txHash = await executeBnbSweep(
            deps,
            cfg,
            derivationIndex,
            token,
            amount,
            destinationHotSafe,
            fromAddr,
            sweepId
          );
        } else {
          txHash = await executeSolanaSweep(
            deps,
            cfg,
            derivationIndex,
            token,
            amount,
            destinationHotSafe
          );
        }

        await callSweepBroadcasted(adminOpts, sweepId, txHash);
        logger.info({ sweepId, txHash }, 'Sweep broadcast recorded in admin-api');

        await callSweepConfirmed(adminOpts, sweepId);
        logger.info({ sweepId, chain }, 'Sweep confirmation recorded in admin-api');
      });
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'sweep_execute job completed'));
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'sweep_execute job failed')
  );
  worker.on('error', (err) => logger.error({ err }, 'sweep_execute worker error'));
  worker.on('closing', () => stopHeartbeat());

  return worker;
}

// ── Chain-specific execution ─────────────────────────────────────────────────

async function executeBnbSweep(
  deps: SweepWorkerDeps,
  cfg: AppConfig,
  derivationIndex: number,
  token: string,
  amount: string,
  destinationHotSafe: string,
  fromAddr: string,
  sweepId: string
): Promise<string> {
  const tokenContract = (
    token === 'USDT' ? cfg.USDT_BNB_ADDRESS : cfg.USDC_BNB_ADDRESS
  ) as `0x${string}`;

  const [nonce, feeData] = await Promise.all([
    deps.bnbPool.provider.getTransactionCount(fromAddr, 'pending'),
    deps.bnbPool.provider.getFeeData(),
  ]);

  const gasPrice = ((feeData.gasPrice ?? BigInt(1_000_000_000)) * 120n) / 100n;
  logger.info({ sweepId, gasPrice: gasPrice.toString() }, 'Dynamic gas pricing');

  const signed = await buildAndSignSweepEVM({
    userAddressIndex: derivationIndex,
    token: token as 'USDT' | 'USDC',
    tokenContract,
    amount: BigInt(Math.floor(Number(amount) * 1e18)),
    destinationHotSafe: destinationHotSafe as `0x${string}`,
    nonce,
    gasPrice,
  });

  const result = await broadcastSweepEVM(
    signed.txHex,
    deps.bnbPool.provider as unknown as Parameters<typeof broadcastSweepEVM>[1]
  );
  return result.txHash;
}

async function executeSolanaSweep(
  deps: SweepWorkerDeps,
  cfg: AppConfig,
  derivationIndex: number,
  token: string,
  amount: string,
  destinationHotSafe: string
): Promise<string> {
  const mintAddress = token === 'USDT' ? cfg.USDT_SOL_MINT : cfg.USDC_SOL_MINT;
  const mint = new PublicKey(mintAddress);
  const dest = new PublicKey(destinationHotSafe);

  const { blockhash } = await deps.solPool.primary.getLatestBlockhash('confirmed');

  const signed = await buildAndSignSweepSolana(
    {
      userAddressIndex: derivationIndex,
      mint,
      amount: BigInt(Math.floor(Number(amount) * 1e6)),
      destinationHotSafe: dest,
    },
    blockhash
  );

  const result = await broadcastSweepSolana(signed.txBase64, deps.solPool.primary);
  return result.signature;
}
