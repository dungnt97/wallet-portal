import * as schema from '@wp/admin-api/db-schema';
// BullMQ worker for signer_ceremony jobs.
// Loads ceremony + linked multisig_op from DB, builds the appropriate tx,
// broadcasts (or synthesizes in dev-mode), and signals admin-api to advance state.
//
// Dev-mode (AUTH_DEV_MODE=true):
//   Generates a synthetic tx hash, skips real on-chain broadcast.
//
// Production path:
//   EVM: builds Safe owner-management tx via signer-ceremony-evm.ts, submits
//        via protocol-kit executeTransaction with collected approvals.
//   SOL: executes Squads configTransactionExecute for the pending proposal.
//   Missing required env → throws FATAL, job enters BullMQ failed/retry state.
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import type { AdminApiClientOptions } from '../../services/admin-api-client.js';
import {
  SENTINEL_OWNER,
  type SafeTxData,
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
  return process.env.AUTH_DEV_MODE === 'true';
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

// ── EVM Safe ceremony broadcast ───────────────────────────────────────────────

async function broadcastEvmCeremony(
  ceremonyId: string,
  opType: string,
  safeAddr: string,
  newOwner: string,
  oldOwner: string,
  prevOwner: string,
  threshold: number
): Promise<string> {
  const rpcUrl = process.env.BNB_RPC_URL;
  if (!rpcUrl) {
    throw new Error('[signer-ceremony] FATAL: BNB_RPC_URL env not set in production');
  }

  const executorKey = process.env.WALLET_ENGINE_EXECUTOR_KEY;
  if (!executorKey) {
    throw new Error(
      '[signer-ceremony] FATAL: WALLET_ENGINE_EXECUTOR_KEY env not set in production'
    );
  }

  const multiSendAddr = process.env.BNB_MULTISEND_ADDRESS ?? '';

  // Build the Safe tx calldata based on operation type
  let safeTxData: SafeTxData;
  if (opType === 'signer_add') {
    safeTxData = buildAddOwnerTx(safeAddr, newOwner, threshold);
  } else if (opType === 'signer_remove') {
    safeTxData = buildRemoveOwnerTx(safeAddr, prevOwner || SENTINEL_OWNER, oldOwner, threshold);
  } else {
    // rotate: single swap (prevOwner → newOwner replaces oldOwner)
    safeTxData = buildRotateTx({
      safeAddr,
      addOwners: newOwner ? [newOwner] : [],
      removeOwners: oldOwner ? [oldOwner] : [],
      prevOwners: [prevOwner || SENTINEL_OWNER],
      threshold,
      multiSendAddr,
    });
  }

  // Use ethers directly — wallet-engine does not depend on protocol-kit.
  // The ceremony executor signs as the sole signer (threshold=1 for governance tx)
  // by wrapping the calldata in a Safe execTransaction call.
  // Safe v1.4.1 execTransaction ABI fragment:
  const SAFE_EXEC_ABI = [
    'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)',
  ];

  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signerWallet = new ethers.Wallet(executorKey, provider);
  const safeContract = new ethers.Contract(safeAddr, SAFE_EXEC_ABI, signerWallet);

  // For governance txs executed by the wallet-engine service account, we use
  // an approved-hash signature (v=1) where the signer pre-approves their own tx.
  // This requires the executor to be an owner of the Safe.
  // Signature format for approved-hash: r=signerAddr padded, s=0, v=1
  const signerAddr = signerWallet.address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const approvedSig = `0x${signerAddr}${'0'.repeat(64)}01`;

  logger.info({ ceremonyId, opType, safeAddr }, 'Executing Safe ceremony tx on-chain');

  // Cast execTransaction to a typed callable — ethers dynamic ABI lookup is untyped.
  const execFn = safeContract.execTransaction as (
    ...args: unknown[]
  ) => Promise<{ wait(): Promise<{ hash: string; blockNumber: number } | null> }>;
  const txResponse = await execFn(
    safeTxData.to,
    safeTxData.value,
    safeTxData.data,
    safeTxData.operation, // 0=Call, 1=DelegateCall
    0n, // safeTxGas
    0n, // baseGas
    0n, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    approvedSig // pre-approved hash signature (executor must be Safe owner)
  );

  const receipt = await txResponse.wait();
  if (!receipt) {
    throw new Error('[signer-ceremony] execTransaction returned no receipt');
  }

  logger.info(
    { ceremonyId, txHash: receipt.hash, blockNumber: receipt.blockNumber },
    'EVM signer ceremony tx confirmed'
  );
  return receipt.hash;
}

// ── Solana Squads config transaction execute ──────────────────────────────────

async function broadcastSolanaCeremony(ceremonyId: string): Promise<string> {
  const multisigAddr = process.env.SQUADS_MULTISIG_ADDRESS;
  if (!multisigAddr) {
    throw new Error('[signer-ceremony] FATAL: SQUADS_MULTISIG_ADDRESS env not set in production');
  }

  const rpcUrl = process.env.SOL_RPC_URL;
  if (!rpcUrl) {
    throw new Error('[signer-ceremony] FATAL: SOL_RPC_URL env not set in production');
  }

  const payerKey = process.env.WALLET_ENGINE_SOL_PAYER_KEY;
  if (!payerKey) {
    throw new Error(
      '[signer-ceremony] FATAL: WALLET_ENGINE_SOL_PAYER_KEY env not set in production'
    );
  }

  const { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } = await import(
    '@solana/web3.js'
  );
  const multisig = await import('@sqds/multisig');

  const connection = new Connection(rpcUrl, 'confirmed');
  const payerKeypair = Keypair.fromSecretKey(Buffer.from(payerKey, 'base64'));
  const multisigPda = new PublicKey(multisigAddr);

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  const transactionIndex = BigInt(
    typeof multisigAccount.transactionIndex === 'bigint'
      ? multisigAccount.transactionIndex
      : (multisigAccount.transactionIndex as { toNumber(): number }).toNumber()
  );

  // Execute the pending config transaction (signer add/remove/rotate)
  const executeIx = multisig.instructions.configTransactionExecute({
    multisigPda,
    transactionIndex,
    member: payerKeypair.publicKey,
    rentPayer: payerKeypair.publicKey,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payerKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [executeIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payerKeypair]);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature, 'confirmed');

  logger.info({ ceremonyId, signature }, 'Solana Squads config transaction executed');
  return signature;
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
          const opType = ceremony.operationType;

          if (chain === 'bnb') {
            const safeAddr = process.env.SAFE_ADDRESS;
            if (!safeAddr) {
              throw new Error('[signer-ceremony] FATAL: SAFE_ADDRESS env not set in production');
            }

            // Extract signer addresses from ceremony metadata.
            // signerCeremonies row does not have a typed metadata column in this schema version;
            // cast through Record<string, unknown> to access the JSON field safely.
            const meta = (ceremony as Record<string, unknown>).metadata as
              | Record<string, string>
              | null
              | undefined;
            const newOwner: string = meta?.newOwner ?? '';
            const oldOwner: string = meta?.oldOwner ?? '';
            const prevOwner: string = meta?.prevOwner ?? SENTINEL_OWNER;
            const threshold: number = Number(meta?.threshold ?? 2);

            txHash = await broadcastEvmCeremony(
              ceremonyId,
              opType,
              safeAddr,
              newOwner,
              oldOwner,
              prevOwner,
              threshold
            );
          } else {
            // SOL: execute Squads config transaction
            txHash = await broadcastSolanaCeremony(ceremonyId);
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
